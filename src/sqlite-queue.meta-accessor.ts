import 'reflect-metadata'
import { Inject, Injectable } from '@nestjs/common'
import { DiscoveryService, MetadataScanner, Reflector } from '@nestjs/core'
import {
  SQLITE_QUEUE_EVENT_TOKEN,
  SQLITE_QUEUE_HANDLER_TOKEN,
  SQLITE_QUEUE_PROCESS_TOKEN,
} from './sqlite-queue.constants'

@Injectable()
export class SQLiteQueueMetadataAccessor {
  constructor(
    private reflector: Reflector,
    private metadataScanner: MetadataScanner,
    @Inject(DiscoveryService) private discoveryService: DiscoveryService
  ) {}

  findConsumerForQueue(name: string) {
    let consumers = this.discoveryService
      .getProviders()
      .filter(
        ({ metatype }) =>
          metatype && Reflect.getMetadata(SQLITE_QUEUE_HANDLER_TOKEN, metatype) === name
      )

    if (consumers.length > 1) {
      throw new Error(
        `Multiple consumers found for queue ${name}. Each queue must have a single unique consumer.`
      )
    }

    if (!consumers.length) {
      throw new Error(
        `No consumer found for queue ${name}. You must use the @Processor decorator to register a Consumer for a Queue and add the consumer as a provider.`
      )
    }

    return consumers[0]
  }

  findConsumerProcessMethods(consumerInstance: any) {
    let methodNames = this.metadataScanner.getAllMethodNames(consumerInstance)

    let workerProcessMethods = methodNames
      .map((methodName) => {
        let method = consumerInstance[methodName]
        let methodMetaKeys = Reflect.getMetadataKeys(method)
        let methodMeta = this.reflector.get(SQLITE_QUEUE_PROCESS_TOKEN, method)

        if (methodMetaKeys?.length && methodMetaKeys.includes(SQLITE_QUEUE_PROCESS_TOKEN)) {
          return { methodName, method, methodMeta }
        }
      })
      .filter(Boolean)

    if (!workerProcessMethods.length) {
      throw new Error(
        `No Process methods found for queue ${consumerInstance}. You must use the @Process decorator to register a handler method for a Consumer.`
      )
    }

    return workerProcessMethods
  }

  findConsumerEventMethods(consumerInstance: any) {
    let methodNames = this.metadataScanner.getAllMethodNames(consumerInstance)

    let workerEventMethods = methodNames
      .map((methodName) => {
        let method = consumerInstance[methodName]
        let methodMetaKeys = Reflect.getMetadataKeys(method)
        let methodMeta = this.reflector.get(SQLITE_QUEUE_EVENT_TOKEN, method)

        if (methodMetaKeys?.length && methodMetaKeys.includes(SQLITE_QUEUE_EVENT_TOKEN)) {
          return { methodName, method, methodMeta }
        }
      })
      .filter(Boolean)

    return workerEventMethods
  }
}
