import { Injectable, Logger } from '@nestjs/common'
import { JobStatus, type Job } from './models/job.model'
import { getWorkerEventName } from './sqlite-queue.util'
import EventEmitter from 'node:events'
import type { SQLiteQueueConfig } from './sqlite-queue.interfaces'
import type { SQLiteQueueService } from './sqlite-queue.service'

@Injectable()
export class SQLiteQueueWorker {
  private readonly logger: Logger

  private activeJobs = 0
  private maxParallelJobs

  constructor(
    private readonly config: SQLiteQueueConfig,
    private readonly queueService: SQLiteQueueService,
    private readonly eventEmitter: EventEmitter
  ) {
    this.maxParallelJobs = config.maxParallelJobs
    this.logger = new Logger('QueueProcessor:' + this.config.name)

    setInterval(() => {
      this.consumeEvents()
    }, 1000)
  }

  private async consumeEvents() {
    const transaction = await this.queueService.createTransaction()
    const event = await this.queueService.getLatestNewJob(transaction)

    if (!event || (this.maxParallelJobs && this.activeJobs >= this.maxParallelJobs)) {
      await transaction.commit()
      return
    }

    await this.queueService.markAsProcessing(event.id, transaction)
    await transaction.commit()
    this.emitWorkerEvent(event, JobStatus.PROCESSING)

    if (this.maxParallelJobs) {
      this.activeJobs++
    }

    try {
      const result = await this.handleJob(event)
      let updatedEvent = await this.queueService.markAsProcessed(event.id, result ?? null)

      this.emitWorkerEvent(updatedEvent, JobStatus.DONE)
    } catch (error: unknown) {
      let message = error instanceof Error ? error.message : 'Unknown error'
      this.logger.error(`Job: ${event.id} Couldn't be processed --- ${message}`)

      let updatedEvent = await this.queueService.markAsFailed(event.id)

      this.emitWorkerEvent(updatedEvent, JobStatus.FAILED)
    } finally {
      if (this.maxParallelJobs) {
        this.activeJobs--
      }
    }

    this.logger.log(`Processing event done -- id ${event.id} ---- ${event.name}`)
  }

  private async handleJob(event: Job) {
    if (event.name) {
      let method = this[event.name]

      if (method) {
        return method(event)
      } else {
        this.logger.error(
          `Processor method not found for a named job: ${event.name}. When using named jobs, you must use the 
          @Processor('jobName') decorator to create processors for each unique name added to a queue`
        )
      }
    }

    return this['defaultHandler'](event)
  }

  private emitWorkerEvent(event: Job, status: JobStatus) {
    this.eventEmitter.emit(getWorkerEventName(this.config.name, status), event)
  }

  private defaultHandler(event: Job) {
    this.logger.log(`Default handler for job ${event.id} --- ${event.name}`)
  }
}
