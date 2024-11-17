import { createJobModelDefinition, type JobStatus } from './models/job.model'
import {
  SQLITE_QUEUE_DEFAULT_CONNECTION_NAME,
  SQLITE_QUEUE_DEFAULT_QUEUE_NAME,
} from './sqlite-queue.constants'
import { Sequelize, type SequelizeOptions } from 'sequelize-typescript'
import type { SQLiteQueueModuleConfig } from './sqlite-queue.interfaces'
import type { SyncOptions } from 'sequelize'

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

export async function createSequelizeConnection(config: SQLiteQueueModuleConfig) {
  let sequelizeConnectionOptions: SequelizeOptions = {
    dialect: 'sqlite',
    repositoryMode: true,
    storage: config.storagePath,
    dialectOptions: {
      mode: 0,
    },
    models: [],
    logging: false,
    //logging: (msg) => log(options.storagePath, msg),
  }

  const sequelize = new Sequelize(sequelizeConnectionOptions)

  await sequelize.query('PRAGMA journal_mode=WAL;')

  return sequelize
}

export async function createJobModel(
  tableName: string,
  sequelize: Sequelize,
  syncOptions: SyncOptions
) {
  let modelDefinition = createJobModelDefinition(tableName, sequelize)

  await modelDefinition.sync(syncOptions)

  return modelDefinition
}
