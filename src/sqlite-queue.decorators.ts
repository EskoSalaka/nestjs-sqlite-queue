import { Inject, SetMetadata } from '@nestjs/common'
import {
  DEFAULT_QUEUE_NAME,
  SQLITE_QUEUE_EVENT_TOKEN,
  SQLITE_QUEUE_HANDLER_TOKEN,
  SQLITE_QUEUE_PROCESS_TOKEN,
} from './sqlite-queue.constants'
import { getQueueToken } from './sqlite-queue.util'
import type { JobStatus } from './models/job.model'

export const Processor = (name: string) => SetMetadata(SQLITE_QUEUE_HANDLER_TOKEN, name)
export const Process = (name?: string) => SetMetadata(SQLITE_QUEUE_PROCESS_TOKEN, name)
export const InjectQueue = (name: string = DEFAULT_QUEUE_NAME): ParameterDecorator =>
  Inject(getQueueToken(name))
export const OnWorkerEvent = (workerEvent: JobStatus): MethodDecorator =>
  SetMetadata(SQLITE_QUEUE_EVENT_TOKEN, workerEvent)
