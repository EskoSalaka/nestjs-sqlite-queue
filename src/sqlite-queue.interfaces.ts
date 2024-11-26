import type { ModuleMetadata } from '@nestjs/common'
import type { SyncOptions } from 'sequelize'

export interface SQLiteQueueConfig {
  name?: string
  connection?: string
  pollRate?: number
  maxParallelJobs?: number
  jobTimeout?: number
  synchronize?: SyncOptions
}

export interface SQLiteQueueModuleConfig {
  storage: string
}

export interface SQLiteQueueModuleAsyncConfig extends Pick<ModuleMetadata, 'imports'> {
  inject?: any[]
  useFactory?: (...args: any[]) => Promise<SQLiteQueueModuleConfig> | SQLiteQueueModuleConfig
}

export interface CreateJobOptions {
  maxRetries?: number
}
