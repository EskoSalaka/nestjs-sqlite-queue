import { Injectable } from '@nestjs/common'
import { JobStatus, type Job } from './models/job.model'
import { getWorkerEventName } from './sqlite-queue.util'
import EventEmitter from 'node:events'
import type { SQLiteQueueConfig } from './sqlite-queue.interfaces'
import type { SQLiteQueue } from './sqlite-queue.service'
import { SQLITE_QUEUE_DEFAULT_QUEUE_NAME } from './sqlite-queue.constants'
import { JobTimeoutError } from './sqlite-queue.errors'

@Injectable()
export class SQLiteQueueWorker {
  private pollRate: number = 1000
  private activeJobs: number = 0
  private maxParallelJobs: number
  private jobTimeout: number

  constructor(
    private readonly config: SQLiteQueueConfig,
    private readonly queue: SQLiteQueue,
    private readonly eventEmitter: EventEmitter
  ) {
    this.maxParallelJobs = config.maxParallelJobs || 0
    this.jobTimeout = config.jobTimeout || 30000
    this.pollRate = config.pollRate || 1000

    setInterval(() => {
      this.consumeEvents()
    }, this.pollRate)
  }

  private async consumeEvents() {
    if (this.queue.isPaused()) {
      return
    }

    let event = await this.findFirstAndMarkAsProcessing()

    if (!event) {
      return
    }

    try {
      let result = await this.handleJob(event)
      let completedEvent = await this.completeJob(event, result)

      return completedEvent
    } catch (error: unknown) {
      await this.handleFailure(event, error)
    } finally {
      if (this.maxParallelJobs) {
        this.activeJobs--
      }
    }
  }

  /**
   * @throws {JobTimeoutError} if the job execution times out
   * @throws {Error} if the job execution fails
   */
  private async handleJob(event: Job) {
    let jobHandler = this.getHandlerMethod(event)
    let jobResult = await this.raceExecutionTimeout(jobHandler, event, this.jobTimeout)

    return jobResult
  }

  private emitWorkerEvent(event: Job, status: JobStatus) {
    this.eventEmitter.emit(
      getWorkerEventName(this.config.name ?? SQLITE_QUEUE_DEFAULT_QUEUE_NAME, status),
      event
    )
  }

  private async findFirstAndMarkAsProcessing(): Promise<Job | null> {
    const transaction = await this.queue.createTransaction()
    let event = await this.queue.getFirstNewJob(transaction)

    if (!event || (this.maxParallelJobs && this.activeJobs >= this.maxParallelJobs)) {
      await transaction.commit()

      return null
    }

    let processingEvent = await this.queue.markAsProcessing(event.id, transaction)
    await transaction.commit()
    this.emitWorkerEvent(processingEvent, JobStatus.PROCESSING)

    if (this.maxParallelJobs) {
      this.activeJobs++
    }

    return processingEvent
  }

  //#TODO: Implement other error handling, like retries and save error message/stacktrace
  private async handleFailure(event: Job, error: unknown) {
    if (error instanceof JobTimeoutError) {
      let stalledEvent = await this.queue.markAsStalled(event.id)
      this.emitWorkerEvent(stalledEvent, JobStatus.STALLED)

      return stalledEvent
    }

    let failedEvent = await this.queue.markAsFailed(event.id)
    this.emitWorkerEvent(failedEvent, JobStatus.FAILED)

    return failedEvent
  }

  private async completeJob(event: Job, result: any) {
    let processedEvent = await this.queue.markAsProcessed(event.id, result)
    this.emitWorkerEvent(processedEvent, JobStatus.DONE)

    return processedEvent
  }

  private getHandlerMethod(event: Job) {
    if (event.name) {
      if (!this[event.name]) {
        throw new Error(`Processor method not found for a named job: ${event.name}. When using named jobs, you must use the 
          @Processor('jobName') decorator to create processors for each unique name added to a queue`)
      }

      return this[event.name]
    } else {
      return this.defaultHandler
    }
  }

  private async raceExecutionTimeout(method: (event: Job) => any, event: Job, timeout: number) {
    let timeoutHandler: NodeJS.Timeout

    let jobResult = await Promise.race([
      method(event),
      this.runTimer(timeoutHandler, timeout),
    ]).finally(() => {
      clearTimeout(timeoutHandler)
    })

    return jobResult
  }

  private runTimer(timeoutHandler: NodeJS.Timeout, timeout: number) {
    return new Promise((_, reject) => {
      timeoutHandler = setTimeout(() => {
        reject(new JobTimeoutError(`Job timed out after ${this.jobTimeout}ms`))
      }, timeout)
    })
  }

  private defaultHandler(event: Job) {}
}
