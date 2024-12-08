# nestjs-sqlite-queue

A simple locally persistent queue implementation for NestJS which uses SQLite and Sequelize under the hood.

## How it works

This library uses Sequelize (see https://sequelize.org/) to create and manager SQLite databases. Each queue is a separate table in the database and a database can have many queue tables. The library provides a `SQLiteQueue` services for each connection that can be injected into your classes and used to create jobs and manage the queue.

Workers are created for each consumer that process jobs from the queue. The workers poll the queue for new jobs at a specified rate and process the jobs using the consumer methods. The workers can be configured to run a maximum number of jobs in parallel and can be paused and unpaused at any time. The polling rate can also be configured. The workers emit events that you can listen to in the consumer class.

Jobs are represented as rows in the queue tables and have a specific status that represent the state of the job (WAITING, PROCESSING, DONE, STALLED, FAILED). Workers poll the queue for fresh jobs and change the status of the jobs as they are processed.

Jobs can be retried a specified number of times if they fail. They can have a timeout after which they are marked as STALLED or FAILED depending on how the Consumer wants to handle this scenario. Jobs can also be named and the consumer can have multiple different methods that process jobs with different names.

### Queues on SQLite vs Redis

Redis and libraries like Bull and BullMQ are definitely the go-to solution for implementing queues in Node since they are mature, fast, reliable and scalable. However, for smaller projects or projects that don't require the scalability and reliability of Redis, an SQL database as a Queue will probably be just fine. In particular, sqlite is really easy to use and requires barely any setup unlike Redis for which you need to have a Redis server running.

The main problems with sqlite in particular are:

- The database is stored on disk (or memory). This means it doesn't have the persistence of redis (or traditional SQL databasesz) and doesn't scale horizontally as easily.
- It lacks the Pub/Sub functionality of redis which is useful for real-time applications. You can't easily listen for new jobs in the queue without polling the database and polling is a hard limiter on the rate you can pick up new jobs from the queue for processing. This means that if there are a lot of jobs in the queue, the workers might not be able to keep up with the rate of new jobs being added to the queue even if they are able to process the jobs quickly.
- Not as fast as redis when the data gets large but for smaller projects this is not an issue. It can still handle a lot of data and if need be, the data can also be pruned. For smaller data, it is actually faster than redis.
- There is no row-level locking in sqlite and transactions lock the entire database. This can be a problem if you have a lot of concurrent writes

  The main benefits of using sqlite are:

- No need to have a separate server running
- Almost zero setup
- Very easy to use and handle the data. You can easily inspect the data in the database and manipulate it if needed. For backups you can simply copy the database file or the disk.

### Why use this library and is it production ready?

This library is really easy to setup for a NestJs project and provides a simple way to implement queues in your project. I wrote it simply because I wanted to learn more about creating NestJs libraries, was lacking any good project to work on and was interested in learning more about Queues. It is not as feature-rich as Bull or BullMQ and is not meant to replace them. It is meant to be a simple and easy-to-use alternative for smaller projects that don't require Redis. The base of this project was heavily inspired by the BullMQ library and this article by Jason Gorman https://jasongorman.uk/writing/sqlite-background-job-system/ about creating a background job system with sqlite.

So far this library is well unit-tested but not at all proven in any real-world scenarios. There are sure to be more or less issues that I haven't thought of. I would say that it is probably fine to use for a smaller project that has low traffic. I would not recommend using this in a serious production environment without testing it first.

I will be happy to receive any feedback and I plan to add more features and improvements in the future.

### What is missing

Some core functionalities that are missing from a full-featured 1.0 release are:

- Recovering from application shutdowns or crashes when jobs are being processed. There should be some easy process that marks jobs as STALLED if a job is stuck in the PROCESSING after a shutdown
- Some faster way of getting the jobs from the queue to the workers. Currently, the workers poll the queue for new jobs at a specified rate. There could for example be a way to pull more jobs when the workers are running out of jobs to process and it is known that there are more jobs in the queue.
- DRAINED event. An event that is emitted when the queue is empty and all jobs have been processed.

Other features:

- Repeated jobs. Jobs that are repeated at a certain interval.
- backoff strategies for retries. Exponential backoff, linear backoff etc.
- Job dependencies. Jobs that depend on other jobs.
- Job progress. Jobs that report their progress.

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

You can also use the special string `:memory:` to create an in-memory database with `storage: ':memory:'`

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

### Configuration options for the module

```typescript
/**
 * Configuration for the SQLiteQueueModule. This will setup the connection to the SQLite database.
 */
interface SQLiteQueueModuleConfig {
  /**
   * The path to the SQLite database file. If the file does not exist, it will be created. You can also use the special string ':memory:' to create an in-memory database. This is useful for testing and development purposes and many in-memory databases can be created.
   */
  storage: string
}
```

### Configuration options for the queue

```typescript
/**
 * Configuration options for the SQLite queue.
 */
interface SQLiteQueueConfig {
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
```

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
const jobOptions: CreateJobOptions = { timeout: 30000 }
const job: Job = await this.myQueue.createJob({ dataForMyJob: 'data' }, jobOptions)
```

### Job options

```typescript
/**
 * Options for creating a job in the queue.
 */
interface CreateJobOptions {
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
   * The priority of the job. Jobs with higher priority are processed first.
   * @default 0
   *
   */
  priority?: number

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

  /**
   * The timestamp when the job should be processed after. This is used to schedule (or delay) jobs for later processing.
   * @default undefined
   */
  processAfter?: Date

  /**
   * Whether the job should be removed after it is completed.
   * @default false
   */
  removeOnComplete?: boolean

  /**
   * Whether the job should be removed after it fails.
   * @default false
   */
  removeOnFail?: boolean
}
```

### The Job objects in thye database

```typescript
/**
 * Represents a job in the queue.
 */
interface Job {
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
   * Priority of the job. Jobs with higher priority are processed first.
   * @default 0
   */
  priority: number

  /**
   * Indicates if the job should be removed after it is completed.
   * @default false
   */
  removeOnComplete: boolean

  /**
   * Indicates if the job should be removed after it fails.
   * @default false
   */
  removeOnFail: boolean

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

  /**
   * Timestamp for when the job should be processed after. This is used to schedule jobs for later processing.
   */
  processAfter: Date | null
}

/**
 * Status of a job in the queue. The value is basically an integer in the database
 * WAITING = 0
 * PROCESSING = 1
 * DONE = 2
 * STALLED = 3
 * FAILED = 4
 */
enum JobStatus {
  /**
   * The job is waiting to be processed.
   */
  WAITING,

  /**
   * The job is currently being processed.
   */
  PROCESSING,

  /**
   * The job has been processed successfully.
   */
  DONE,

  /**
   * The job has stalled and is not progressing.
   */
  STALLED,

  /**
   * The job has failed to process.
   */
  FAILED,
}
```

### The SQLiteQueue service

The `SQLiteQueue` service provides a number of methods for managing the queue. You can use these at your own discretion but note that some of them may have unwanted effects. For example, there are methods that change the state of the Jobs in the queue and if you are not careful, you may end up with jobs that are stuck in a state that they should not be in.

The SQLiteQueue service also provides an access to the underlying Sequelize model and connection. This grants you the ability to control the queue tables and the database directly if you need to.

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

## Worker Events

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
  onProcessinge(job: Job, data: any) {
    console.log(`Job ${job.id} is now being processed with data: ${data}`)
  }

  @OnWorkerEvent(WorkerEvent.DONE)
  onDone(job: Job, result: any) {
    console.log(`Job ${job.id} has been processed successfully with result: ${result}`)
  }

  @OnWorkerEvent(WorkerEvent.ERROR)
  onError(job: Job, error: Error) {
    console.log(`Job ${job.id} has thrown an error: ${error.message}`)
  }

  @OnWorkerEvent(WorkerEvent.FAILED)
  onFailed(job: Job, error: Error) {
    console.log(`Job ${job.id} has failed with error: ${error.message}`)
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

## Named jobs

Named jobs are jobs that are created with a specific name and can be used to create jobs that are processed by a specific consumer methods. When creating a named job, the consumer must have a method that is decorated with the `@Process` decorator and the `name` argument must match the name of the job added to the queue. A Consumer can have multiple methods that are decorated with the `@Process` decorator each for a different named job.

```typescript
@Processor('my-queue')
export class MyConsumer {
  @Process('named-job')
  async myNamedJobHandler(job: Job) {
    // Do something with the job.
    let result = await doSomethingWithTheNamedjob(job)

    return result
  }

  @Process('another-named-job')
  async myOtherNamedJobHandler(job: Job) {
    // Do something with the job.
    let result = await doSomethingWithTheOtherNamedjob(job)

    return result
  }
}
```

To add a named job to the queue, you can use the `createJob` method of the `SQLiteQueue` service and provide the name of the job as the first argument:

```typescript
let jobOptions: CreateJobOptions = ...

const job: Job = await this.myQueue.createJob('my-named-job', { dataForMyJob: 'data' }, jobOptions)
```

## License

This project is licensed under the MIT License.
