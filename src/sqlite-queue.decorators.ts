import { Inject, SetMetadata } from '@nestjs/common'
import {
  SQLITE_QUEUE_DEFAULT_QUEUE_NAME,
  SQLITE_QUEUE_EVENT_TOKEN,
  SQLITE_QUEUE_HANDLER_TOKEN,
  SQLITE_QUEUE_PROCESS_TOKEN,
} from './sqlite-queue.constants'
import { getQueueToken } from './sqlite-queue.util'
import type { WorkerEvent } from './sqlite-queue.types'

export const Processor = (name?: string) =>
  SetMetadata(SQLITE_QUEUE_HANDLER_TOKEN, name ?? SQLITE_QUEUE_DEFAULT_QUEUE_NAME)
export const Process = (name?: string) => SetMetadata(SQLITE_QUEUE_PROCESS_TOKEN, name)
export const InjectQueue = (name?: string): ParameterDecorator => Inject(getQueueToken(name))
export const OnWorkerEvent = (workerEvent: WorkerEvent): MethodDecorator =>
  SetMetadata(SQLITE_QUEUE_EVENT_TOKEN, workerEvent)
