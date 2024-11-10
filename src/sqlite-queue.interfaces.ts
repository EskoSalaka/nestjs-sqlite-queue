import type { ModuleMetadata } from '@nestjs/common'

export interface SQLiteQueueConfig {
  name: string
  connection?: string
  maxParallelJobs?: number
  synchronize: boolean
}

export interface SQLiteQueueModuleConfig {
  storagePath: string
}

export interface SQLiteQueueModuleAsyncConfig extends Pick<ModuleMetadata, 'imports'> {
  inject?: any[]
  useFactory?: (...args: any[]) => Promise<SQLiteQueueModuleConfig> | SQLiteQueueModuleConfig
}
