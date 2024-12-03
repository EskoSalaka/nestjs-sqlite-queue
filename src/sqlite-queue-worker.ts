import { Injectable, Logger } from '@nestjs/common'
import { getWorkerEventName } from './sqlite-queue.util'
import EventEmitter from 'node:events'
import type { Job, SQLiteQueueConfig } from './sqlite-queue.interfaces'
import type { SQLiteQueue } from './sqlite-queue.service'
import { SQLITE_QUEUE_DEFAULT_QUEUE_NAME } from './sqlite-queue.constants'
import { JobTimeoutError } from './sqlite-queue.errors'
import { WorkerEvent } from './sqlite-queue.types'

@Injectable()
export class SQLiteQueueWorker {
  private pollRate: number
  private activeJobs: number = 0
  private maxParallelJobs: number

  private readonly logger = new Logger(SQLiteQueueWorker.name)

  constructor(
    private readonly config: SQLiteQueueConfig,
    private readonly queue: SQLiteQueue,
    private readonly eventEmitter: EventEmitter
  ) {
    this.maxParallelJobs = config.maxParallelJobs || 0
    this.pollRate = config.pollRate || 1000

    setInterval(() => {
      this.consumeEvents()
    }, this.pollRate)
  }

  private async consumeEvents() {
    if (
      this.queue.isPaused() ||
      (this.maxParallelJobs && this.activeJobs >= this.maxParallelJobs)
    ) {
      return
    }

    let event: Job | null = null
    try {
      event = await this.findFirstAndMarkAsProcessing()
    } catch (e) {
      this.logger.error('Error in finding new jobs from the Queue', e)
    }

    if (!event) {
      return
    }

    if (this.maxParallelJobs) {
      this.activeJobs++
    }

    try {
      let result = await this.handleJob(event)

      try {
        let completedEvent = await this.completeJob(event, result)

        return completedEvent
      } catch (e) {
        this.logger.error('Error in completing job', e)
      }
    } catch (error: unknown) {
      try {
        await this.handleFailure(event, error)
      } catch (e) {
        this.logger.error('Error in handling failure of job', e)
      }
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
    let jobResult = await this.raceExecutionTimeout(jobHandler, event, event.timeout)

    return jobResult
  }

  private emitWorkerEvent(event: Job, workerEvent: WorkerEvent, extras?: unknown) {
    if (extras) {
      this.eventEmitter.emit(
        getWorkerEventName(this.config.name ?? SQLITE_QUEUE_DEFAULT_QUEUE_NAME, workerEvent),
        event,
        extras
      )
    } else {
      this.eventEmitter.emit(
        getWorkerEventName(this.config.name ?? SQLITE_QUEUE_DEFAULT_QUEUE_NAME, workerEvent),
        event
      )
    }
  }

  private async findFirstAndMarkAsProcessing(): Promise<Job | null> {
    const transaction = await this.queue.createTransaction()
    let event = await this.queue.getFirstNewJob(transaction)

    if (!event) {
      await transaction.commit()

      return null
    }

    let processingEvent = await this.queue.markAsProcessing(event.id, transaction)
    await transaction.commit()
    this.emitWorkerEvent(processingEvent, WorkerEvent.PROCESSING, event.data)

    return processingEvent
  }

  private async handleFailure(event: Job, error: unknown) {
    this.emitWorkerEvent(event, WorkerEvent.ERROR, error)

    // Note: If the job is created with failOnTimeout=false the job will be marked as stalled
    // instead of failed when it times out. If the job is created with failOnTimeout=true, the
    // job will be marked as failed on timeout AND retries will be attempted if applicable.
    if (error instanceof JobTimeoutError && !event.failOnTimeout) {
      let stalledEvent = await this.queue.markAsStalled(event.id)
      this.emitWorkerEvent(stalledEvent, WorkerEvent.STALLED)

      return stalledEvent
    }

    if (event.retries > 0 && event.retries > event.retriesAttempted) {
      let retriedEvent = await this.queue.markForRetry(event.id)

      return retriedEvent
    }

    let failedEvent = await this.queue.markAsFailed(event.id, error)
    this.emitWorkerEvent(failedEvent, WorkerEvent.FAILED, error)

    return failedEvent
  }

  private async completeJob(event: Job, result: any) {
    let processedEvent = await this.queue.markAsProcessed(event.id, result)
    this.emitWorkerEvent(processedEvent, WorkerEvent.DONE, result)

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
        reject(new JobTimeoutError(`Job timed out after ${timeout}ms`))
      }, timeout)
    })
  }

  private defaultHandler(event: Job) {}
}
