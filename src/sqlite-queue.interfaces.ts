import type { ModuleMetadata } from '@nestjs/common'
import type { SyncOptions } from 'sequelize'

/**
 * Configuration options for the SQLite queue.
 */
export interface SQLiteQueueConfig {
  /**
   * The name of the queue. This is used to identify the queue in the database and the queue can then be
   * injected into services using this name. If not provided, the default name will be used.
   * @default undefined
   */
  name?: string

  /**
   * The name of the connection to use. If not provided, the default connection will be used.
   * @default undefined
   */
  connection?: string

  /**
   * The rate at which the queue polls for new jobs, in milliseconds.
   * @default 1000
   */
  pollRate?: number

  /**
   * The maximum number of jobs that can run in parallel. By default, there is no
   * limit, but you probably want to use some specific limit to avoid overloading your system.
   * @default undefined
   */
  maxParallelJobs?: number

  /**
   * Options for synchronizing the queue
   * (see [Sequelize documentation](https://sequelize.org/master/manual/model-basics.html#synchronization)).
   *
   * Basically, syncing the queue will update the database schema to match the model definition. A new table will
   * be created if it doesn't exist even without this option, but this can also be used to update
   * the table when the model definition changes. Force-syncing will drop the table completely and recreate it.
   *
   * This is mostly meant for development purposes, and you probably don't want to use this in production.
   * @default undefined
   */
  synchronize?: SyncOptions
}

/**
 * Configuration for the SQLiteQueueModule.
 */
export interface SQLiteQueueModuleConfig {
  /**
   * The path to the SQLite database file.
   */
  storage: string
  loggingOptions?: LoggingOptions
}

/**
 * Options for Sequelize logging (see [Sequelize documentation](https://sequelize.org/master/manual/getting-started.html#logging)).
 *
 * Logging is useful for debugging and not recommended for production as a lot of things will get logged.
 */
export interface LoggingOptions {
  /**
   * A function that gets executed while running the query to log the sql.
   */
  logging?: boolean | ((sql: string, timing?: number) => void)

  /**
   * Pass query execution time in milliseconds as second argument to logging function (options.logging).
   */
  benchmark?: boolean
}

export interface SQLiteQueueModuleAsyncConfig extends Pick<ModuleMetadata, 'imports'> {
  inject?: any[]
  useFactory?: (...args: any[]) => Promise<SQLiteQueueModuleConfig> | SQLiteQueueModuleConfig
}

/**
 * Options for creating a job in the queue.
 */
export interface CreateJobOptions {
  /**
   * The number of times the job should be retried if it fails. If set to 0, the job will not be retried.
   * This is to prevent jobs stalling and occupying the queue indefinitely.
   * @default 30000
   */
  retries?: number

  /**
   * The maximum time (in milliseconds) the job is allowed to run before timing out.
   * @default undefined
   */
  timeout?: number

  /**
   * Whether the job should fail if it times out. If set to `false`, the job will be marked as STALLED instead
   * of FAILED when it times out. If set to `true`, the job will be marked as FAILED on timeout AND retries will
   * be attempted if applicable.
   *
   * Jobs that are marked STALLED might need to be handled somehow manually. This is to prevent issues with jobs potentially
   * being processed multiple times if the worker crashes or is stopped while processing a job. Even if a job times
   * out, it can possible still be running in the background and should then not be retried.
   * @default false
   */
  failOnTimeout?: boolean
}

/**
 * Status of a job in the queue.
 */
export enum JobStatus {
  /**
   * The job is waiting to be processed.
   */
  WAITING = 'WAITING',

  /**
   * The job is currently being processed.
   */
  PROCESSING = 'PROCESSING',

  /**
   * The job has been processed successfully.
   */
  DONE = 'DONE',

  /**
   * The job has stalled and is not progressing.
   */
  STALLED = 'STALLED',

  /**
   * The job has failed to process.
   */
  FAILED = 'FAILED',
}

/**
 * Represents a job in the queue.
 */
export interface Job {
  /**
   * Unique identifier for the job.
   */
  id: number

  /**
   * Name of the job.
   */
  name: string | null

  /**
   * Data associated with the job. Can be any JSON-serializable data and is used to store the input data for the job.
   */
  data: JSONObject | null

  /**
   * Result data after the job is processed. Can be any JSON-serializable data and is used to store the result of the job.
   */
  resultData: JSONObject | null

  /**
   * Current status of the job.
   */
  status: JobStatus

  /**
   * Number of retries allowed for the job.
   */
  retries: number

  /**
   * Number of retries attempted so far.
   */
  retriesAttempted: number

  /**
   * Timeout duration for the job in milliseconds.
   */
  timeout: number

  /**
   * Indicates if the job should fail when it times out.
   */
  failOnTimeout: boolean

  /**
   * Error message if the job fails.
   */
  errorMessage: string | null

  /**
   * Stack trace of the error if the job fails.
   */
  errorStack: string | null

  /**
   * Timestamp when the job was created.
   */
  createdAt: Date

  /**
   * Timestamp when the job started processing.
   */
  processingAt: Date | null

  /**
   * Timestamp when the job was completed.
   */
  doneAt: Date | null

  /**
   * Timestamp when the job was stalled.
   */
  stalledAt: Date | null

  /**
   * Timestamp when the job failed.
   */
  failedAt: Date | null

  /**
   * Timestamp when the job was last updated.
   */
  updatedAt: Date
}
interface JSONArray extends Array<JSONValue> {}
export type JSONValue = string | number | boolean | null | JSONObject | JSONArray
export interface JSONObject {
  [x: string]: JSONValue
}
