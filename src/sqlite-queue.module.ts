import 'reflect-metadata'
import { Inject, Module, type OnApplicationShutdown } from '@nestjs/common'
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
import {
  createJobModel,
  createSequelizeConnection,
  getConnectionToken,
  getQueueToken,
  getWorkerEventName,
} from './sqlite-queue.util'
import { JobModel } from './models/job.model'
import { defer, lastValueFrom } from 'rxjs'
import { EventEmitter } from 'node:events'
import { SQLiteQueueMetadataAccessor } from './sqlite-queue.meta-accessor'
import { ModuleRef } from '@nestjs/core'
import type { WorkerEvent } from './sqlite-queue.types'
import { Sequelize } from 'sequelize'

@Module({})
export class SQLiteQueueModule implements OnApplicationShutdown {
  static workers: SQLiteQueueWorker[] = []

  static forRoot(config: SQLiteQueueModuleConfig, connection?: string) {
    const connectionName = connection ?? SQLITE_QUEUE_DEFAULT_CONNECTION_NAME

    const connectionNameProvider = {
      provide: SQLITE_QUEUE_CONNECTION_NAME_TOKEN,
      useValue: connectionName,
    }

    const connectionProvider = {
      provide: getConnectionToken(connectionName),
      useFactory: async () => SQLiteQueueModule.createConnectionFactory(config),
    }

    return {
      module: SQLiteQueueModule,
      providers: [connectionNameProvider, connectionProvider],
      exports: [connectionNameProvider, connectionProvider],
      global: true,
    }
  }

  async onApplicationShutdown() {
    for (const worker of SQLiteQueueModule.workers) {
      worker.shutDown()
    }

    try {
      const connectionToken = getConnectionToken(this.connectionName)
      const connection = this.moduleRef.get<Sequelize>(connectionToken, { strict: false })

      if (connection) {
        await connection.close()
      }
    } catch (error) {}
  }

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
      global: true,
    }
  }

  public static async registerQueue(config: SQLiteQueueConfig) {
    let sqliteQueueProvider = {
      provide: getQueueToken(config.name),
      useFactory: async (dbConnection: Sequelize, metaAccessor: SQLiteQueueMetadataAccessor) => {
        let model = await createJobModel(config.name, dbConnection, config.synchronize)

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
      ],
      exports: [sqliteQueueProvider],
      global: true,
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
    SQLiteQueueModule.workers.push(worker)

    for (const workerProcessMethodWithMeta of workerProcessMethods) {
      if (!workerProcessMethodWithMeta.methodMeta) {
        worker['defaultHandler'] = (job: any) =>
          consumerInstance[workerProcessMethodWithMeta.methodName](job)
      } else {
        worker[workerProcessMethodWithMeta.methodMeta as string] = (job: any) =>
          consumerInstance[workerProcessMethodWithMeta.methodName](job)
      }
    }

    for (const workerEventMethodWithMeta of workerEventMethods) {
      eventEmitter.on(
        getWorkerEventName(
          config.name ?? SQLITE_QUEUE_DEFAULT_QUEUE_NAME,
          workerEventMethodWithMeta.methodMeta as WorkerEvent
        ),
        (job: any, extras?: any) => {
          if (!extras) {
            consumerInstance[workerEventMethodWithMeta.methodName](job)
          } else {
            consumerInstance[workerEventMethodWithMeta.methodName](job, extras)
          }
        }
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
        return await createSequelizeConnection(options)
      })
    )
  }
}
