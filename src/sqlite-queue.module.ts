import 'reflect-metadata'
import { Global, Module } from '@nestjs/common'
import {
  SQLiteQueueConfig,
  type SQLiteQueueModuleAsyncConfig,
  type SQLiteQueueModuleConfig,
} from './sqlite-queue.interfaces'
import { SqliteQueue } from './sqlite-queue'
import { SQLiteQueueService } from './sqlite-queue.service'
import { SQLITE_QUEUE_CONFIG_TOKEN } from './sqlite-queue.constants'
import { SQLiteQueueWorker } from './sqlite-queue-worker'
import { MetadataScanner, DiscoveryService, Reflector } from '@nestjs/core'
import { Sequelize, SequelizeOptions } from 'sequelize-typescript'
import {
  getConnectionToken,
  getQueueServiceToken,
  getQueueToken,
  getWorkerEventName,
} from './sqlite-queue.util'
import { createJobModel, JobModel, type JobStatus } from './models/job.model'
import { defer, lastValueFrom } from 'rxjs'
import { EventEmitter } from 'node:events'
import { SQLiteQueueMetadataAccessor } from './sqlite-queue.meta-accessor'

@Global()
@Module({})
export class SQLiteQueueModule {
  static forRootAsync(options: SQLiteQueueModuleAsyncConfig, connection: string) {
    let moduleOptionsProvider = SQLiteQueueModule.createAsyncOptiosProvider(options)
    let connectionProvider = {
      provide: getConnectionToken(connection),
      useFactory: async (config: SQLiteQueueModuleConfig) => {
        return SQLiteQueueModule.createConnectionFactory(config)
      },
      inject: [SQLITE_QUEUE_CONFIG_TOKEN],
    }

    return {
      module: SQLiteQueueModule,
      providers: [moduleOptionsProvider, connectionProvider],
      exports: [connectionProvider],
    }
  }

  public static async registerQueue(config: SQLiteQueueConfig) {
    let sqliteQueueServiceProvider = {
      provide: getQueueServiceToken(config.connection),
      useFactory: async (dbConnection: Sequelize) => {
        let model = createJobModel(config.name, dbConnection)

        await model.sync({ force: false })

        return new SQLiteQueueService(model as typeof JobModel)
      },
      inject: [getConnectionToken(config.connection)],
    }

    let queueProvider = {
      provide: getQueueToken(config.name),
      useFactory: (
        sqliteQueueService: SQLiteQueueService,
        metaAccessor: SQLiteQueueMetadataAccessor
      ) => {
        SQLiteQueueModule.registerWorker(config, metaAccessor, sqliteQueueService)

        return new SqliteQueue(sqliteQueueService)
      },
      inject: [getQueueServiceToken(config.connection), SQLiteQueueMetadataAccessor],
    }

    return {
      module: SQLiteQueueModule,
      imports: [],
      providers: [
        sqliteQueueServiceProvider,
        queueProvider,
        SQLiteQueueMetadataAccessor,
        DiscoveryService,
        MetadataScanner,
        Reflector,
      ],
      exports: [sqliteQueueServiceProvider, queueProvider],
    }
  }

  static async registerWorker(
    config: SQLiteQueueConfig,
    metaAccessor: SQLiteQueueMetadataAccessor,
    sqliteQueueService: SQLiteQueueService
  ) {
    let { instance: consumerInstance } = metaAccessor.findConsumerForQueue(config.name)
    let workerProcessMethods = metaAccessor.findConsumerProcessMethods(consumerInstance)
    let workerEventMethods = metaAccessor.findConsumerEventMethods(consumerInstance)

    let eventEmitter = new EventEmitter()
    let worker = new SQLiteQueueWorker(config, sqliteQueueService, eventEmitter)

    for (const workerProcessMethodWithMeta of workerProcessMethods) {
      if (!workerProcessMethodWithMeta.methodMeta) {
        worker['defaultHandler'] = workerProcessMethodWithMeta.method.bind(consumerInstance)
      } else {
        worker[workerProcessMethodWithMeta.methodMeta as string] =
          workerProcessMethodWithMeta.method.bind(consumerInstance)
      }
    }

    for (const workerEventMethodWithMeta of workerEventMethods) {
      eventEmitter.on(
        getWorkerEventName(config.name, workerEventMethodWithMeta.methodMeta as JobStatus),
        workerEventMethodWithMeta.method.bind(consumerInstance)
      )
    }
  }

  static createAsyncOptiosProvider(options: SQLiteQueueModuleAsyncConfig) {
    if (!(options || options.useFactory)) {
      throw new Error('Invalid configuration. For now, only useFactory is supported.')
    }

    return {
      provide: SQLITE_QUEUE_CONFIG_TOKEN,
      useFactory: options.useFactory,
      inject: options.inject || [],
    }
  }

  private static async createConnectionFactory(
    options: SQLiteQueueModuleConfig
  ): Promise<Sequelize> {
    return lastValueFrom(
      defer(async () => {
        let config: SequelizeOptions = {
          dialect: 'sqlite',
          repositoryMode: true,

          storage: options.storagePath,
          dialectOptions: {
            mode: 0,
          },
          models: [],
          logging: false,
          //logging: (msg) => log(options.storagePath, msg),
        }

        const sequelize = new Sequelize(config)

        return sequelize
      })
    )
  }
}
