# nestjs-sqlite-queue

A simple locally persistent queue implementation for NestJS which uses SQLite and Sequelize under the hood.

## Installation and configuration

Install the package using npm:

```bash
$ npm install nestjs-sqlite-queue
```

Add the `SQLiteQueueModule` to your root application module. The below will create a connection to a SQLite database at `path/to/your/sqlite.db`:

```typescript
import { SQLiteQueueModule } from 'nestjs-sqlite-queue'

@Module({
  imports: [
    SQLiteQueueModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        storage: 'path/to/your/sqlite.db',
      }),
      inject: [ConfigService],
    }),
  ],
})
export class AppModule {}
```

Then, register a queue in your root application module. This will create a queue table in the SQLite database and provide a `SQLiteQueue` service instance to the application:

```typescript
SQLiteQueueModule.registerQueue({}),
```

### Named configurations

The names of the connections and queues are optional and default to certain default names.

You can create multiple different connections with multiple different queues by using named configurations. Each connection will create its own separate sqlite database and each queue is a separate table in the corresponding databases. First create the named connections with the SQLiteQueueModule.forRootAsync method:

```typescript
SQLiteQueueModule.forRootAsync(
  {
    imports: [ConfigModule],
    useFactory: (configService: ConfigService) => ({
      storage: 'path/to/your/sqlite1.db',
    }),
    inject: [ConfigService],
    'my-connection-1'
  },
),
SQLiteQueueModule.forRootAsync(
  {
    imports: [ConfigModule],
    useFactory: (configService: ConfigService) => ({
      storage: 'path/to/your/sqlite2.db',
    }),
    inject: [ConfigService],
    'my-connection-2'
  },
),
```

Then, you can register multiple queues for the given connections with the SQLiteQueueModule.registerQueue method:

```typescript
SQLiteQueueModule.registerQueue({
  connection: 'my-connection-1',
  name: 'my-queue-1',
}),
SQLiteQueueModule.registerQueue({
  connection: 'my-connection-1',
  name: 'my-queue-2',
}),
SQLiteQueueModule.registerQueue({
  connection: 'my-connection-2',
  name: 'my-queue-3',
}),
SqliteQueueModule.registerQueue({
  connection: 'my-connection-2',
  name: 'my-queue-4',
}),
```

#Todo: Connection configuration
#Todo: Explain queue configuration

## Using the queue

Now that you have a queue registered, you can inject the `SQLiteQueue` service into your classes as follows:

```typescript
import { Injectable } from '@nestjs/common'
import { InjectQueue, type SQLiteQueue } from 'nestjs-sqlite-queue'

@Injectable()
export class MyService {
  constructor(@InjectQueue('my-queue') private myQueue: SQLiteQueue) {}
}
```

The `@InjectQueue` decorator uses the name of the queue you want to inject. If you have not provided a name when registering the queue, you can omit the name-argument to the decorator.

The `SQLiteQueue` is a service similar to BullMQ's Producers but also contains many other methods for managing the queue. Mainly, you want use the `createJob` method to add a fresh job to the queue:

```typescript
const job: Job = await this.myQueue.createJob({ dataForMyJob: 'data' }, { timeout: 30000 })
```

### Job options

#TODO: Explain job options

### The Job objects

#TODO: Explain job objects

### The SQLiteQueue service

The `SQLiteQueue` service provides a number of methods for managing the queue. You can use these at your own discretion but note that some of them may have unwanted effects. For example, there are methods that change the state of the Jobs in the queue and if you are not careful, you may end up with jobs that are stuck in a state that they should not be in.

The SQLiteQueue service also provides an access to the underlying Sequelize model and connection. This grants you the ability to control the queue tables and the database directly if you really need to.

## Consumers

Consumers, similar to BullMQ's Consumers, are classes that process jobs from the queue. A worker is created for each consumer that handles running jobs from the queue under the hood.

Each queue registered with the `SQLiteQueueModule.ReqisterQueue` can have one consumers. Consumers are declared with the `@Processor` decorator and must be registered in the application as providers. The `@Processor` decorator identifies the name of the queue that the consumer will process jobs from.

Each consumer must have at least one method decorated with the `@Process` decorator. This method will be the handler for the jobs that are processed by the consumer and must return a Promise. The method can optionally return a value that is serializable to JSON, which will be stored in the job's `resultData` field.

```typescript
import { Processor, Process, type Job } from 'nestjs-sqlite-queue'

@Processor('my-queue')
export class MyConsumer {
  @Process()
  async myJobHandler(job: Job) {
    // Do something with the job.
    let result = await doSomethingWithThejob(job)

    return result
  }
}
```

### Worker Events

Workers emit events that you can listen to. The events are similar to BullMQ's Worker events. The Consumer class can listen to these events by using the `@OnWorkerEvent` decorator, which takes the `WorkerEvent` as an argument. The decorated method will be called when the worker emits the event and will receive the job and possible other information as arguments.

```typescript
import { Processor, Process, OnWorkerEvent, WorkerEvent } from 'nestjs-sqlite-queue'

@Processor('my-queue')
export class MyConsumer {
  @Process()
  async myJobHandler(job: Job) {
    // Do something with the job.
    let result = await doSomethingWithThejob(job)

    return result
  }

  @OnWorkerEvent(WorkerEvent.PROCESSING)
  onProcessinge(job: Job) {
    console.log(`Job ${job.id} is now being processed`)
  }

  @OnWorkerEvent(WorkerEvent.DONE)
  onDone(job: Job) {
    console.log(`Job ${job.id} has been processed successfully`)
  }

  @OnWorkerEvent(WorkerEvent.ERROR)
  onError(job: Job, error: Error) {
    console.log(`Job ${job.id} has thrown an error: ${error.message}`)
  }

  @OnWorkerEvent(WorkerEvent.FAILED)
  onFailed(job: Job) {
    console.log(`Job ${job.id} has failed to process`)
  }

  @OnWorkerEvent(WorkerEvent.STALLED)
  onStalled(job: Job) {
    console.log(`Job ${job.id} has stalled`)
  }
}
```

Events that the worker emits are:

- `WorkerEvent.PROCESSING`: Emitted when the worker starts processing a fresh job from the queue.
- `WorkerEvent.DONE`: Emitted when the worker has successfully processed a job.
- `WorkerEvent.COMPLETED`: Emitted when the worker has completed processing a job, regardless of the outcome.
- `WorkerEvent.ERROR`: Emitted when the worker has thrown an error while processing a job. Note, that this doesn't mean that the job has failed if the job has been created with `retries` option. The job will only fail after all the retries have been exhausted.
- `WorkerEvent.FAILED`: Emitted when the worker has failed to process a job. Note, that this event is emitted after all the retries have been exhausted if the job has been created with `retries` option.
- `WorkerEvent.STALLED`: Emitted when the worker has stalled while processing a job. It can be caused by the worker crashing or the job handler taking too long to process the job. Note, that if you have created job with failOnTimeout=true, the job will be marked as failed after the timeout has passed and this event will not be emitted. Instead, the WorkerEvent.FAILED event will be emitted. Retries will also be attempted if the job has been created with `retries` option.

## License

This project is licensed under the MIT License.
