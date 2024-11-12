import * as fs from 'node:fs'
import * as path from 'node:path'
import { Test, TestingModule } from '@nestjs/testing'
import { INestApplication } from '@nestjs/common'
import { SQLiteQueueModule } from '../../src/sqlite-queue.module'
import { log } from 'console'
import { getConnectionToken, getQueueToken } from '../../src/sqlite-queue.util'
import { TestConsumer } from './src/test.consumer'
import { TestConsumerWithNamedJobs } from './src/named-test.consumer'
import {
  SQLITE_QUEUE_DEFAULT_CONNECTION_NAME,
  SQLITE_QUEUE_DEFAULT_QUEUE_NAME,
} from '../../src/sqlite-queue.constants'
import { TestService } from './src/test.service'
import { type SQLiteQueue } from 'src'
import type { Sequelize } from 'sequelize'

export const TEST_CONNECTION_1 = 'TEST_CONNECTION_1'
export const TEST_CONNECTION_2 = 'TEST_CONNECTION_2'

export const TEST_QUEUE = 'TEST_QUEUE'

export const NAMED_JOBS_TEST_QUEUE = 'NAMED_JOBS_TEST_QUEUE'
export const NAMED_TEST_JOB_1 = 'NAMED_TEST_JOB_1'
export const NAMED_TEST_JOB_2 = 'NAMED_TEST_JOB_2'

describe('SQLiteQueueModule (e2e)', () => {
  let app: INestApplication

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        SQLiteQueueModule.forRootAsync({
          useFactory: () => ({ storagePath: './test/e2e/src/temp/' + TEST_CONNECTION_1 }),
        }),
        SQLiteQueueModule.forRootAsync(
          { useFactory: () => ({ storagePath: './test/e2e/src/temp/' + TEST_CONNECTION_2 }) },
          'TEST_CONNECTION_2'
        ),
        SQLiteQueueModule.registerQueue({}),
        SQLiteQueueModule.registerQueue({
          name: NAMED_JOBS_TEST_QUEUE,
          connection: TEST_CONNECTION_2,
        }),
      ],
      providers: [TestConsumer, TestConsumerWithNamedJobs, TestService],
    }).compile()

    app = moduleFixture.createNestApplication()
    await app.init()
  })

  afterAll(async () => {
    let connection1 = app.get(getConnectionToken()) as Sequelize
    let connection2 = app.get(getConnectionToken(TEST_CONNECTION_2)) as Sequelize

    await connection1.close()
    await connection2.close()

    await app.close()

    let tempDpPath1 = path.join(__dirname, 'src', 'temp', TEST_CONNECTION_1)
    let tempDpPath2 = path.join(__dirname, 'src', 'temp', TEST_CONNECTION_2)

    if (fs.existsSync(tempDpPath1)) {
      fs.rmSync(tempDpPath1, { recursive: true, force: true })
    }

    if (fs.existsSync(tempDpPath2)) {
      fs.rmSync(tempDpPath2, { recursive: true, force: true })
    }
  })

  beforeEach((): void => {
    jest.setTimeout(8000)
  })

  it('should be defined', () => {
    expect(app).toBeDefined()
  })

  it('should register the connections', async () => {
    let connection1 = app.get(getConnectionToken()) //DEFAULT_CONNECTION
    let connection2 = app.get(getConnectionToken(TEST_CONNECTION_2))
    let connectionWithDefault = app.get(getConnectionToken(SQLITE_QUEUE_DEFAULT_CONNECTION_NAME))

    expect(connection1).toBeDefined()
    expect(connection2).toBeDefined()
    expect(connectionWithDefault).toBeDefined()
  })

  it('should register the queues', async () => {
    let queue = app.get(getQueueToken()) // DEFAULT_QUEUE
    let queue2 = app.get(getQueueToken(NAMED_JOBS_TEST_QUEUE))
    let queueWithDefault = app.get(getQueueToken(SQLITE_QUEUE_DEFAULT_QUEUE_NAME))

    expect(queue).toBeDefined()
    expect(queue2).toBeDefined()
    expect(queueWithDefault).toBeDefined()
  })

  it('should create the sqlite files to the temp drectory', async () => {
    let tempDpPath1 = path.join(__dirname, 'src', 'temp', TEST_CONNECTION_1)
    let tempDpPath2 = path.join(__dirname, 'src', 'temp', TEST_CONNECTION_2)

    expect(fs.existsSync(tempDpPath1)).toBeTruthy()
    expect(fs.existsSync(tempDpPath2)).toBeTruthy()
  })

  describe('Queue tests', () => {
    describe('Default Queue', () => {
      it('should add a a new unnamed job with data to the queue and process it', async () => {
        let queue = app.get(getQueueToken()) as SQLiteQueue
        let testService = app.get(TestService)
        jest.spyOn(testService, 'testRun').mockImplementation(async () => {
          await new Promise((resolve) => setTimeout(resolve, 2000))
          return { test: 'test', status: 'done', someData: 'someData' }
        })

        let job = await queue.createJob({ test: 'test' })
        let newJob = await queue.getJob(job.id)

        expect(job).toBeDefined()
        expect(newJob).toBeDefined()
        expect(newJob.status).toBe('NEW')
        expect(newJob.data).toEqual({ test: 'test' })
        expect(newJob.name).toBeNull()

        await new Promise((resolve) => setTimeout(resolve, 1000))
        let jobAfterProcessing = await queue.getJob(job.id)

        expect(jobAfterProcessing).toBeDefined()
        expect(jobAfterProcessing.status).toBe('PROCESSING')
        expect(jobAfterProcessing.data).toEqual({ test: 'test' })
        expect(jobAfterProcessing.name).toBeNull()
        expect(jobAfterProcessing.resultData).toBeNull()

        await new Promise((resolve) => setTimeout(resolve, 2000))
        let jobAfterDone = await queue.getJob(job.id)

        expect(jobAfterDone).toBeDefined()
        expect(jobAfterDone.status).toBe('DONE')
        expect(jobAfterDone.data).toEqual({ test: 'test' })
        expect(jobAfterDone.name).toBeNull()
        expect(jobAfterDone.resultData).toEqual({
          test: 'test',
          status: 'done',
          someData: 'someData',
        })
      })

      it('should fail to process a job', async () => {
        let queue = app.get(getQueueToken()) as SQLiteQueue
        let testService = app.get(TestService)
        jest.spyOn(testService, 'testRun').mockImplementation(async () => {
          await new Promise((resolve) => setTimeout(resolve, 2000))
          throw new Error('Test error')
        })

        let job = await queue.createJob({ test: 'test' })
        let newJob = await queue.getJob(job.id)

        expect(job).toBeDefined()
        expect(newJob).toBeDefined()
        expect(newJob.status).toBe('NEW')
        expect(newJob.data).toEqual({ test: 'test' })
        expect(newJob.name).toBeNull()

        await new Promise((resolve) => setTimeout(resolve, 1000))
        let jobAfterProcessing = await queue.getJob(job.id)

        expect(jobAfterProcessing).toBeDefined()
        expect(jobAfterProcessing.status).toBe('PROCESSING')
        expect(jobAfterProcessing.data).toEqual({ test: 'test' })
        expect(jobAfterProcessing.name).toBeNull()
        expect(jobAfterProcessing.resultData).toBeNull()

        await new Promise((resolve) => setTimeout(resolve, 2000))
        let jobAfterFailed = await queue.getJob(job.id)

        expect(jobAfterFailed).toBeDefined()
        expect(jobAfterFailed.status).toBe('FAILED')
        expect(jobAfterFailed.data).toEqual({ test: 'test' })
        expect(jobAfterFailed.name).toBeNull()
        expect(jobAfterFailed.resultData).toBeNull()
      })
    })

    describe('NAMED_JOBS_TEST_QUEUE', () => {
      it('should add a a new named job with data to the queue and process it', async () => {
        let queue = app.get(getQueueToken(NAMED_JOBS_TEST_QUEUE)) as SQLiteQueue
        let testService = app.get(TestService)
        jest.spyOn(testService, 'testRun').mockImplementation(async () => {
          await new Promise((resolve) => setTimeout(resolve, 2000))
          return { test: 'test', status: 'done', someData: 'someData' }
        })

        let job = await queue.createJob(NAMED_TEST_JOB_1, { test: 'test' })
        let newJob = await queue.getJob(job.id)

        expect(job).toBeDefined()
        expect(newJob).toBeDefined()
        expect(newJob.status).toBe('NEW')
        expect(newJob.data).toEqual({ test: 'test' })
        expect(newJob.name).toBe(NAMED_TEST_JOB_1)

        await new Promise((resolve) => setTimeout(resolve, 1000))
        let jobAfterProcessing = await queue.getJob(job.id)

        expect(jobAfterProcessing).toBeDefined()
        expect(jobAfterProcessing.status).toBe('PROCESSING')
        expect(jobAfterProcessing.data).toEqual({ test: 'test' })
        expect(jobAfterProcessing.name).toBe(NAMED_TEST_JOB_1)
        expect(jobAfterProcessing.resultData).toBeNull()

        await new Promise((resolve) => setTimeout(resolve, 2000))
        let jobAfterDone = await queue.getJob(job.id)

        expect(jobAfterDone).toBeDefined()
        expect(jobAfterDone.status).toBe('DONE')
        expect(jobAfterDone.data).toEqual({ test: 'test' })
        expect(jobAfterDone.name).toBe(NAMED_TEST_JOB_1)
        expect(jobAfterDone.resultData).toEqual({
          test: 'test',
          status: 'done',
          someData: 'someData',
        })
      })

      it('should fail to process a named job', async () => {
        let queue = app.get(getQueueToken(NAMED_JOBS_TEST_QUEUE)) as SQLiteQueue
        let testService = app.get(TestService)
        jest.spyOn(testService, 'testRun2').mockImplementation(async () => {
          await new Promise((resolve) => setTimeout(resolve, 2000))
          throw new Error('Test error')
        })

        let job = await queue.createJob(NAMED_TEST_JOB_2, { test: 'test' })
        let newJob = await queue.getJob(job.id)

        expect(job).toBeDefined()
        expect(newJob).toBeDefined()
        expect(newJob.status).toBe('NEW')
        expect(newJob.data).toEqual({ test: 'test' })
        expect(newJob.name).toBe(NAMED_TEST_JOB_2)

        await new Promise((resolve) => setTimeout(resolve, 1000))
        let jobAfterProcessing = await queue.getJob(job.id)

        expect(jobAfterProcessing).toBeDefined()
        expect(jobAfterProcessing.status).toBe('PROCESSING')
        expect(jobAfterProcessing.data).toEqual({ test: 'test' })
        expect(jobAfterProcessing.name).toBe(NAMED_TEST_JOB_2)
        expect(jobAfterProcessing.resultData).toBeNull()

        await new Promise((resolve) => setTimeout(resolve, 2000))
        let jobAfterFailed = await queue.getJob(job.id)

        expect(jobAfterFailed).toBeDefined()
        expect(jobAfterFailed.status).toBe('FAILED')
        expect(jobAfterFailed.data).toEqual({ test: 'test' })
        expect(jobAfterFailed.name).toBe(NAMED_TEST_JOB_2)
        expect(jobAfterFailed.resultData).toBeNull()
      })

      it('should process a named job and fail another named job correctly', async () => {
        let queue = app.get(getQueueToken(NAMED_JOBS_TEST_QUEUE)) as SQLiteQueue
        let testService = app.get(TestService)
        jest.spyOn(testService, 'testRun').mockImplementation(async () => {
          await new Promise((resolve) => setTimeout(resolve, 2000))
          return { test: 'test', status: 'done', someData: 'someData' }
        })

        jest.spyOn(testService, 'testRun2').mockImplementation(async () => {
          await new Promise((resolve) => setTimeout(resolve, 2000))
          throw new Error('Test error')
        })

        let job1 = await queue.createJob(NAMED_TEST_JOB_1, { test: 'test1' })
        let job2 = await queue.createJob(NAMED_TEST_JOB_2, { test: 'test2' })

        let newJob1 = await queue.getJob(job1.id)
        let newJob2 = await queue.getJob(job2.id)

        expect(job1).toBeDefined()
        expect(job2).toBeDefined()
        expect(newJob1).toBeDefined()
        expect(newJob2).toBeDefined()
        expect(newJob1.status).toBe('NEW')
        expect(newJob2.status).toBe('NEW')
        expect(newJob1.data).toEqual({ test: 'test1' })
        expect(newJob2.data).toEqual({ test: 'test2' })
        expect(newJob1.name).toBe(NAMED_TEST_JOB_1)
        expect(newJob2.name).toBe(NAMED_TEST_JOB_2)

        await new Promise((resolve) => setTimeout(resolve, 2500))
        let jobAfterProcessing1 = await queue.getJob(job1.id)
        let jobAfterProcessing2 = await queue.getJob(job2.id)

        expect(jobAfterProcessing1).toBeDefined()
        expect(jobAfterProcessing2).toBeDefined()
        expect(jobAfterProcessing1.status).toBe('PROCESSING')
        expect(jobAfterProcessing2.status).toBe('PROCESSING')
        expect(jobAfterProcessing1.data).toEqual({ test: 'test1' })
        expect(jobAfterProcessing2.data).toEqual({ test: 'test2' })
        expect(jobAfterProcessing1.name).toBe(NAMED_TEST_JOB_1)
        expect(jobAfterProcessing2.name).toBe(NAMED_TEST_JOB_2)
        expect(jobAfterProcessing1.resultData).toBeNull()
        expect(jobAfterProcessing2.resultData).toBeNull()

        await new Promise((resolve) => setTimeout(resolve, 2000))
        let jobAfterDone1 = await queue.getJob(job1.id)
        let jobAfterFailed2 = await queue.getJob(job2.id)

        expect(jobAfterDone1).toBeDefined()
        expect(jobAfterFailed2).toBeDefined()
        expect(jobAfterDone1.status).toBe('DONE')
        expect(jobAfterFailed2.status).toBe('FAILED')
        expect(jobAfterDone1.data).toEqual({ test: 'test1' })
        expect(jobAfterFailed2.data).toEqual({ test: 'test2' })
        expect(jobAfterDone1.name).toBe(NAMED_TEST_JOB_1)
        expect(jobAfterFailed2.name).toBe(NAMED_TEST_JOB_2)
        expect(jobAfterDone1.resultData).toEqual({
          test: 'test',
          status: 'done',
          someData: 'someData',
        })
        expect(jobAfterFailed2.resultData).toBeNull()
      })

      it('should fail to process a named job with a non existing method', async () => {
        let queue = app.get(getQueueToken(NAMED_JOBS_TEST_QUEUE)) as SQLiteQueue
        let testService = app.get(TestService)
        jest.spyOn(testService, 'testRun').mockImplementation(async () => {
          await new Promise((resolve) => setTimeout(resolve, 2000))
          throw new Error('Test error')
        })

        let job = await queue.createJob('jobNameWithNoProccessor', { test: 'test' })
        let newJob = await queue.getJob(job.id)

        expect(job).toBeDefined()
        expect(newJob).toBeDefined()
        expect(newJob.status).toBe('NEW')
        expect(newJob.data).toEqual({ test: 'test' })
        expect(newJob.name).toBe('jobNameWithNoProccessor')

        await new Promise((resolve) => setTimeout(resolve, 1000))
        let jobAfterFailed = await queue.getJob(job.id)

        expect(jobAfterFailed).toBeDefined()
        expect(jobAfterFailed.status).toBe('FAILED')
        expect(jobAfterFailed.data).toEqual({ test: 'test' })
        expect(jobAfterFailed.name).toBe('jobNameWithNoProccessor')
        expect(jobAfterFailed.resultData).toBeNull()
      })
    })
  })
})
