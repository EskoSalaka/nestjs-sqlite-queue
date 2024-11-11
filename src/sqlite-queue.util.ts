import type { JobStatus } from './models/job.model'
import {
  SQLITE_QUEUE_DEFAULT_CONNECTION_NAME,
  SQLITE_QUEUE_DEFAULT_QUEUE_NAME,
} from './sqlite-queue.constants'

export function getConnectionToken(
  connection: string = SQLITE_QUEUE_DEFAULT_CONNECTION_NAME
): string {
  return 'SQliteQueueConnection:' + connection
}

export function getQueueToken(name: string = SQLITE_QUEUE_DEFAULT_QUEUE_NAME): string {
  return 'SQLiteQueue:' + name
}

export function getWorkerEventName(name: string, status: JobStatus): string {
  return `SQLiteQueueWorkerEvent:${name}:${status}`
}
