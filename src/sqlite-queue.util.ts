import type { JobStatus } from './models/job.model'
import { DEFAULT_CONNECTION_NAME, DEFAULT_QUEUE_NAME } from './sqlite-queue.constants'

export function getConnectionToken(connection: string = DEFAULT_CONNECTION_NAME): string {
  return 'SQliteQueueConnection:' + connection
}

export function getQueueServiceToken(connection: string = DEFAULT_CONNECTION_NAME): string {
  return 'SQLiteQueueService:' + connection
}

export function getQueueToken(name: string = DEFAULT_QUEUE_NAME): string {
  return 'SQLiteQueue:' + name
}

export function getWorkerEventName(name: string, status: JobStatus): string {
  return `SQLiteQueueWorkerEvent:${name}:${status}`
}
