import { createJobModelDefinition } from './models/job.model'
import {
  SQLITE_QUEUE_DEFAULT_CONNECTION_NAME,
  SQLITE_QUEUE_DEFAULT_QUEUE_NAME,
} from './sqlite-queue.constants'
import type { SQLiteQueueModuleConfig } from './sqlite-queue.interfaces'
import { Sequelize, type Options, type SyncOptions } from 'sequelize'
import type { WorkerEvent } from './sqlite-queue.types'

export function getConnectionToken(
  connection: string = SQLITE_QUEUE_DEFAULT_CONNECTION_NAME
): string {
  return 'SQliteQueueConnection:' + connection
}

export function getQueueToken(name: string = SQLITE_QUEUE_DEFAULT_QUEUE_NAME): string {
  return 'SQLiteQueue:' + name
}

export function getWorkerEventName(name: string, event: WorkerEvent): string {
  return `SQLiteQueueWorkerEvent:${name}:${event}`
}

export async function createSequelizeConnection(config: SQLiteQueueModuleConfig) {
  let sequelizeConnectionOptions: Options = {
    dialect: 'sqlite',
    storage: config.storage,
    dialectOptions: {
      mode: 0,
    },
    logging: false,
    //logging: (msg) => log(options.storagePath, msg),
  }

  const sequelize = new Sequelize(sequelizeConnectionOptions)

  await sequelize.query('PRAGMA journal_mode=WAL;')

  return sequelize
}

export async function createJobModel(
  tableName: string = 'default_queue',
  sequelize: Sequelize,
  syncOptions: SyncOptions
) {
  let modelDefinition = createJobModelDefinition(tableName, sequelize)

  await modelDefinition.sync(syncOptions)

  return modelDefinition
}
