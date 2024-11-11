import 'reflect-metadata'
import { Global, Inject, Module, type OnApplicationShutdown } from '@nestjs/common'
import {
  SQLiteQueueConfig,
  type SQLiteQueueModuleAsyncConfig,
  type SQLiteQueueModuleConfig,
} from './sqlite-queue.interfaces'
import { SQLiteQueue } from './sqlite-queue.service'
import {
  SQLITE_QUEUE_CONFIG_TOKEN,
  SQLITE_QUEUE_CONNECTION_NAME_TOKEN,
  SQLITE_QUEUE_DEFAULT_CONNECTION_NAME,
  SQLITE_QUEUE_DEFAULT_QUEUE_NAME,
} from './sqlite-queue.constants'
import { SQLiteQueueWorker } from './sqlite-queue-worker'
import { MetadataScanner, DiscoveryService, Reflector } from '@nestjs/core'
import { Sequelize, SequelizeOptions } from 'sequelize-typescript'
import { getConnectionToken, getQueueToken, getWorkerEventName } from './sqlite-queue.util'
import { createJobModel, JobModel, type JobStatus } from './models/job.model'
import { defer, lastValueFrom } from 'rxjs'
import { EventEmitter } from 'node:events'
import { SQLiteQueueMetadataAccessor } from './sqlite-queue.meta-accessor'
import { log } from 'node:console'
import { ModuleRef } from '@nestjs/core'

@Global()
@Module({})
export class SQLiteQueueModule implements OnApplicationShutdown {
  constructor(
    @Inject(SQLITE_QUEUE_CONNECTION_NAME_TOKEN) private readonly connectionName: string,
    private readonly moduleRef: ModuleRef
  ) {}

  static forRootAsync(options: SQLiteQueueModuleAsyncConfig, connection?: string) {
    let moduleOptionsProvider = SQLiteQueueModule.createAsyncOptiosProvider(options)

    let connectionNameProvider = {
      provide: SQLITE_QUEUE_CONNECTION_NAME_TOKEN,
      useValue: connection ?? SQLITE_QUEUE_DEFAULT_CONNECTION_NAME,
    }

    let connectionProvider = {
      provide: getConnectionToken(connection),
      useFactory: async (config: SQLiteQueueModuleConfig) => {
        return SQLiteQueueModule.createConnectionFactory(config)
      },
      inject: [SQLITE_QUEUE_CONFIG_TOKEN],
    }

    return {
      module: SQLiteQueueModule,
      providers: [connectionNameProvider, moduleOptionsProvider, connectionProvider],
      exports: [connectionNameProvider, connectionProvider],
    }
  }

  public static async registerQueue(config: SQLiteQueueConfig) {
    let sqliteQueueProvider = {
      provide: getQueueToken(config.name ?? SQLITE_QUEUE_DEFAULT_QUEUE_NAME),
      useFactory: async (dbConnection: Sequelize, metaAccessor: SQLiteQueueMetadataAccessor) => {
        let model = createJobModel(config.name, dbConnection)
        await model.sync({ force: false })

        let sqliteQueue = new SQLiteQueue(model as typeof JobModel)
        await SQLiteQueueModule.registerWorker(config, metaAccessor, sqliteQueue)

        return sqliteQueue
      },
      inject: [getConnectionToken(config.connection), SQLiteQueueMetadataAccessor],
    }

    return {
      module: SQLiteQueueModule,
      providers: [
        sqliteQueueProvider,
        SQLiteQueueMetadataAccessor,
        DiscoveryService,
        MetadataScanner,
        Reflector,
      ],
      exports: [sqliteQueueProvider],
    }
  }

  static async registerWorker(
    config: SQLiteQueueConfig,
    metaAccessor: SQLiteQueueMetadataAccessor,
    sqliteQueue: SQLiteQueue
  ) {
    let { instance: consumerInstance } = metaAccessor.findConsumerForQueue(
      config.name ?? SQLITE_QUEUE_DEFAULT_QUEUE_NAME
    )
    let workerProcessMethods = metaAccessor.findConsumerProcessMethods(consumerInstance)
    let workerEventMethods = metaAccessor.findConsumerEventMethods(consumerInstance)

    let eventEmitter = new EventEmitter()
    let worker = new SQLiteQueueWorker(config, sqliteQueue, eventEmitter)

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
        getWorkerEventName(
          config.name ?? SQLITE_QUEUE_DEFAULT_QUEUE_NAME,
          workerEventMethodWithMeta.methodMeta as JobStatus
        ),
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

  async onApplicationShutdown(signal?: string) {
    log('Closing connection', this.connectionName)
  }
}
