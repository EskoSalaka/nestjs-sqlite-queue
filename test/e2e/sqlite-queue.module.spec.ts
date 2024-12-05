import * as fs from 'node:fs'
import * as path from 'node:path'
import { Test, TestingModule } from '@nestjs/testing'
import { INestApplication } from '@nestjs/common'
import { TestConsumer } from './src/test.consumer'
import { TestConsumerWithNamedJobs } from './src/named-test.consumer'
import { TestService } from './src/test.service'
import {
  SQLiteQueueModule,
  getConnectionToken,
  getQueueToken,
  type SQLiteQueue,
  JobStatus,
  SQLITE_QUEUE_DEFAULT_CONNECTION_NAME,
  SQLITE_QUEUE_DEFAULT_QUEUE_NAME,
} from '../../src/'
import type { Sequelize } from 'sequelize'
import { sleep } from './src/util'

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
          useFactory: () => ({ storage: './test/e2e/temp/' + TEST_CONNECTION_1 }),
        }),
        SQLiteQueueModule.forRootAsync(
          { useFactory: () => ({ storage: './test/e2e/temp/' + TEST_CONNECTION_2 }) },
          'TEST_CONNECTION_2'
        ),
        SQLiteQueueModule.registerQueue({ pollRate: 100 }),
        SQLiteQueueModule.registerQueue({
          name: NAMED_JOBS_TEST_QUEUE,
          connection: TEST_CONNECTION_2,
          pollRate: 100,
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

    let tempDpPath1 = path.join(__dirname, 'temp', TEST_CONNECTION_1)
    let tempDpPath2 = path.join(__dirname, 'temp', TEST_CONNECTION_2)

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

  afterEach((): void => {
    jest.clearAllMocks()
  })

  describe('Module', () => {
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
      let tempDpPath1 = path.join(__dirname, 'temp', TEST_CONNECTION_1)
      let tempDpPath2 = path.join(__dirname, 'temp', TEST_CONNECTION_2)

      expect(fs.existsSync(tempDpPath1)).toBeTruthy()
      expect(fs.existsSync(tempDpPath2)).toBeTruthy()
    })
  })

  describe('Queue tests', () => {
    describe('Default Queue', () => {
      it('should add a a new unnamed job with data to the queue and process it', async () => {
        let queue = app.get(getQueueToken()) as SQLiteQueue
        let testService = app.get(TestService)
        let testConsumer = app.get(TestConsumer)

        jest.spyOn(testService, 'testRun').mockImplementationOnce(async (job) => {
          await sleep(200)
          return { test: 'test', status: JobStatus.DONE, someData: 'someData' }
        })
        jest.spyOn(testService, 'testOnActive')
        jest.spyOn(testService, 'testOnDone')
        jest.spyOn(testService, 'testOnFailed')
        jest.spyOn(testConsumer, 'handler')
        jest.spyOn(testConsumer, 'onActive')
        jest.spyOn(testConsumer, 'onDone')
        jest.spyOn(testConsumer, 'onFailed')
        jest.spyOn(testConsumer, 'testRun')

        let succeedingJob = await queue.createJob({ test: 'test' })
        let newSucceedingJob = await queue.getJob(succeedingJob.id)

        expect(succeedingJob).toBeDefined()
        expect(newSucceedingJob).toBeDefined()
        expect(newSucceedingJob.id).toBe(succeedingJob.id)
        expect(newSucceedingJob.status).toBe(JobStatus.WAITING)
        expect(newSucceedingJob.data).toEqual({ test: 'test' })
        expect(newSucceedingJob.name).toBeNull()

        await sleep(150)
        let succeedingJobAfterProcessing = await queue.getJob(succeedingJob.id)

        expect(succeedingJobAfterProcessing).toBeDefined()
        expect(succeedingJobAfterProcessing.status).toBe(JobStatus.PROCESSING)
        expect(succeedingJobAfterProcessing.id).toBe(succeedingJob.id)
        expect(succeedingJobAfterProcessing.data).toEqual({ test: 'test' })
        expect(succeedingJobAfterProcessing.name).toBeNull()
        expect(succeedingJobAfterProcessing.resultData).toBeNull()

        expect(testConsumer.testRun).toHaveBeenCalledTimes(1)
        expect(testConsumer.testRun).toHaveBeenCalledWith(succeedingJobAfterProcessing)
        expect(testConsumer.handler).toHaveBeenCalledTimes(1)
        expect(testConsumer.handler).toHaveBeenCalledWith(succeedingJobAfterProcessing)
        expect(testService.testRun).toHaveBeenCalledTimes(1)
        expect(testConsumer.onActive).toHaveBeenCalledTimes(1)
        expect(testConsumer.onActive).toHaveBeenCalledWith(succeedingJobAfterProcessing, {
          test: 'test',
        })

        await sleep(200)
        let succeedingJobAfterDone = await queue.getJob(newSucceedingJob.id)

        expect(succeedingJobAfterDone).toBeDefined()
        expect(succeedingJobAfterDone.status).toBe(JobStatus.DONE)
        expect(succeedingJobAfterDone.data).toEqual({ test: 'test' })
        expect(succeedingJobAfterDone.name).toBeNull()
        expect(succeedingJobAfterDone.resultData).toEqual({
          test: 'test',
          status: JobStatus.DONE,
          someData: 'someData',
        })

        jest.spyOn(testService, 'testRun').mockImplementationOnce(async () => {
          await sleep(200)
          throw new Error('Test error')
        })

        let failingJob = await queue.createJob({ test: 'failingTest' })
        let newFailingJob = await queue.getJob(failingJob.id)

        expect(failingJob).toBeDefined()
        expect(newFailingJob).toBeDefined()
        expect(newFailingJob.status).toBe(JobStatus.WAITING)
        expect(newFailingJob.data).toEqual({ test: 'failingTest' })
        expect(newFailingJob.id).toBe(failingJob.id)
        expect(newFailingJob.name).toBeNull()

        await sleep(150)
        let failingJobAfterProcessing = await queue.getJob(failingJob.id)

        expect(failingJobAfterProcessing).toBeDefined()
        expect(failingJobAfterProcessing.status).toBe(JobStatus.PROCESSING)
        expect(failingJobAfterProcessing.id).toBe(failingJob.id)
        expect(failingJobAfterProcessing.data).toEqual({ test: 'failingTest' })
        expect(failingJobAfterProcessing.name).toBeNull()
        expect(failingJobAfterProcessing.resultData).toBeNull()

        expect(testConsumer.testRun).toHaveBeenCalledTimes(2)
        expect(testConsumer.testRun).toHaveBeenCalledWith(failingJobAfterProcessing)
        expect(testConsumer.handler).toHaveBeenCalledTimes(2)
        expect(testConsumer.handler).toHaveBeenCalledWith(failingJobAfterProcessing)
        expect(testService.testRun).toHaveBeenCalledTimes(2)
        expect(testConsumer.onActive).toHaveBeenCalledTimes(2)
        expect(testConsumer.onActive).toHaveBeenCalledWith(failingJobAfterProcessing, {
          test: 'failingTest',
        })

        await sleep(200)
        let failingJobAfterFailed = await queue.getJob(newFailingJob.id)

        expect(failingJobAfterFailed).toBeDefined()
        expect(failingJobAfterFailed.status).toBe(JobStatus.FAILED)
        expect(failingJobAfterFailed.id).toBe(failingJob.id)
        expect(failingJobAfterFailed.data).toEqual({ test: 'failingTest' })
        expect(failingJobAfterFailed.name).toBeNull()
        expect(failingJobAfterFailed.resultData).toBeNull()
      })
    })

    describe('NAMED_JOBS_TEST_QUEUE', () => {
      it('should add a a new named job with data to the queue and process it', async () => {
        let queue = app.get(getQueueToken(NAMED_JOBS_TEST_QUEUE)) as SQLiteQueue
        let testService = app.get(TestService)
        let namedTestConsumer = app.get(TestConsumerWithNamedJobs)

        jest.spyOn(testService, 'testRun').mockImplementationOnce(async (job) => {
          await sleep(200)
          return { test: 'test', status: JobStatus.DONE, someData: 'someData' }
        })

        jest.spyOn(testService, 'testRun2').mockImplementationOnce(async (job) => {
          await sleep(400)
          return { test: 'test2', status: 'done2', someData: 'someData2' }
        })

        jest.spyOn(testService, 'testOnActive')
        jest.spyOn(testService, 'testOnDone')
        jest.spyOn(testService, 'testOnFailed')
        jest.spyOn(namedTestConsumer, 'handler1')
        jest.spyOn(namedTestConsumer, 'handler2')
        jest.spyOn(namedTestConsumer, 'onActive')
        jest.spyOn(namedTestConsumer, 'onDone')
        jest.spyOn(namedTestConsumer, 'onFailed')
        jest.spyOn(namedTestConsumer, 'testRun1')
        jest.spyOn(namedTestConsumer, 'testRun2')

        // Add both the named jobs to the queue one after another
        let succeedingNamedJob1 = await queue.createJob(NAMED_TEST_JOB_1, { test: 'test1' })
        let succeedingNamedJob2 = await queue.createJob(NAMED_TEST_JOB_2, { test: 'test2' })

        let newSucceedingNamedJob1 = await queue.getJob(succeedingNamedJob1.id)

        expect(succeedingNamedJob1).toBeDefined()
        expect(newSucceedingNamedJob1).toBeDefined()
        expect(newSucceedingNamedJob1.id).toBe(succeedingNamedJob1.id)
        expect(newSucceedingNamedJob1.status).toBe(JobStatus.WAITING)
        expect(newSucceedingNamedJob1.data).toEqual({ test: 'test1' })
        expect(newSucceedingNamedJob1.name).toBe(NAMED_TEST_JOB_1)

        let newSucceedingNamedJob2 = await queue.getJob(succeedingNamedJob2.id)

        expect(succeedingNamedJob2).toBeDefined()
        expect(newSucceedingNamedJob2).toBeDefined()
        expect(newSucceedingNamedJob2.id).toBe(succeedingNamedJob2.id)
        expect(newSucceedingNamedJob2.status).toBe(JobStatus.WAITING)
        expect(newSucceedingNamedJob2.data).toEqual({ test: 'test2' })
        expect(newSucceedingNamedJob2.name).toBe(NAMED_TEST_JOB_2)

        // Start processing the first named job
        await sleep(100)

        let succeedingNamedJob1AfterProcessing = await queue.getJob(succeedingNamedJob1.id)

        expect(succeedingNamedJob1AfterProcessing).toBeDefined()
        expect(succeedingNamedJob1AfterProcessing.status).toBe(JobStatus.PROCESSING)
        expect(succeedingNamedJob1AfterProcessing.id).toBe(succeedingNamedJob1.id)
        expect(succeedingNamedJob1AfterProcessing.data).toEqual({ test: 'test1' })
        expect(succeedingNamedJob1AfterProcessing.name).toBe(NAMED_TEST_JOB_1)
        expect(succeedingNamedJob1AfterProcessing.resultData).toBeNull()

        expect(namedTestConsumer.testRun1).toHaveBeenCalledTimes(1)
        expect(namedTestConsumer.testRun1).toHaveBeenCalledWith(succeedingNamedJob1AfterProcessing)
        expect(namedTestConsumer.handler1).toHaveBeenCalledTimes(1)
        expect(namedTestConsumer.handler1).toHaveBeenCalledWith(succeedingNamedJob1AfterProcessing)
        expect(testService.testRun).toHaveBeenCalledTimes(1)
        expect(namedTestConsumer.onActive).toHaveBeenCalledTimes(1)
        expect(namedTestConsumer.onActive).toHaveBeenCalledWith(
          succeedingNamedJob1AfterProcessing,
          { test: 'test1' }
        )

        expect(namedTestConsumer.testRun2).toHaveBeenCalledTimes(0)
        expect(namedTestConsumer.handler2).toHaveBeenCalledTimes(0)

        // Finish processing the first named job and start processing the second named job
        await sleep(250)
        let succeedingNamedJob1AfterDone = await queue.getJob(newSucceedingNamedJob1.id)

        expect(succeedingNamedJob1AfterDone).toBeDefined()
        expect(succeedingNamedJob1AfterDone.status).toBe(JobStatus.DONE)
        expect(succeedingNamedJob1AfterDone.data).toEqual({ test: 'test1' })
        expect(succeedingNamedJob1AfterDone.name).toBe(NAMED_TEST_JOB_1)
        expect(succeedingNamedJob1AfterDone.resultData).toEqual({
          test: 'test',
          status: JobStatus.DONE,
          someData: 'someData',
        })

        let succeedingNamedJob2AfterProcessing = await queue.getJob(succeedingNamedJob2.id)

        expect(succeedingNamedJob2AfterProcessing).toBeDefined()
        expect(succeedingNamedJob2AfterProcessing.status).toBe(JobStatus.PROCESSING)
        expect(succeedingNamedJob2AfterProcessing.id).toBe(succeedingNamedJob2.id)
        expect(succeedingNamedJob2AfterProcessing.data).toEqual({ test: 'test2' })
        expect(succeedingNamedJob2AfterProcessing.name).toBe(NAMED_TEST_JOB_2)
        expect(succeedingNamedJob2AfterProcessing.resultData).toBeNull()

        expect(namedTestConsumer.testRun1).toHaveBeenCalledTimes(1)
        expect(namedTestConsumer.handler1).toHaveBeenCalledTimes(1)
        expect(namedTestConsumer.onDone).toHaveBeenCalledTimes(1)
        expect(namedTestConsumer.onDone).toHaveBeenCalledWith(succeedingNamedJob1AfterDone, {
          test: 'test',
          status: JobStatus.DONE,
          someData: 'someData',
        })

        expect(namedTestConsumer.testRun2).toHaveBeenCalledTimes(1)
        expect(namedTestConsumer.testRun2).toHaveBeenCalledWith(succeedingNamedJob2AfterProcessing)
        expect(namedTestConsumer.handler2).toHaveBeenCalledTimes(1)
        expect(namedTestConsumer.handler2).toHaveBeenCalledWith(succeedingNamedJob2AfterProcessing)
        expect(namedTestConsumer.onActive).toHaveBeenCalledTimes(2)
        expect(namedTestConsumer.onActive).toHaveBeenCalledWith(
          succeedingNamedJob2AfterProcessing,
          { test: 'test2' }
        )

        // Finish processing the second named job
        await sleep(300)
        let succeedingNamedJob2AfterDone = await queue.getJob(succeedingNamedJob2.id)

        expect(succeedingNamedJob2AfterDone).toBeDefined()
        expect(succeedingNamedJob2AfterDone.status).toBe(JobStatus.DONE)
        expect(succeedingNamedJob2AfterDone.data).toEqual({ test: 'test2' })
        expect(succeedingNamedJob2AfterDone.name).toBe(NAMED_TEST_JOB_2)
        expect(succeedingNamedJob2AfterDone.resultData).toEqual({
          test: 'test2',
          status: 'done2',
          someData: 'someData2',
        })

        expect(namedTestConsumer.testRun1).toHaveBeenCalledTimes(1)
        expect(namedTestConsumer.handler1).toHaveBeenCalledTimes(1)
        expect(namedTestConsumer.testRun2).toHaveBeenCalledTimes(1)
        expect(namedTestConsumer.handler2).toHaveBeenCalledTimes(1)
        expect(namedTestConsumer.onDone).toHaveBeenCalledTimes(2)
        expect(namedTestConsumer.onDone).toHaveBeenCalledWith(succeedingNamedJob2AfterDone, {
          test: 'test2',
          status: 'done2',
          someData: 'someData2',
        })
        expect(namedTestConsumer.onActive).toHaveBeenCalledTimes(2)

        // Then validate failing jobs
        jest.spyOn(testService, 'testRun').mockImplementationOnce(async () => {
          await sleep(200)
          throw new Error('Test error')
        })

        jest.spyOn(testService, 'testRun2').mockImplementationOnce(async () => {
          await sleep(300)
          throw new Error('Test error 2')
        })

        // Add both the named jobs to the queue one after another
        let failingNamedJob1 = await queue.createJob(NAMED_TEST_JOB_1, { test: 'test1' })
        let failingNamedJob2 = await queue.createJob(NAMED_TEST_JOB_2, { test: 'test2' })

        let newFailingNamedJob1 = await queue.getJob(failingNamedJob1.id)
        let newFailingNamedJob2 = await queue.getJob(failingNamedJob2.id)

        expect(failingNamedJob1).toBeDefined()
        expect(newFailingNamedJob1).toBeDefined()
        expect(newFailingNamedJob1.status).toBe(JobStatus.WAITING)
        expect(newFailingNamedJob1.data).toEqual({ test: 'test1' })
        expect(newFailingNamedJob1.id).toBe(failingNamedJob1.id)
        expect(newFailingNamedJob1.name).toBe(NAMED_TEST_JOB_1)

        expect(failingNamedJob2).toBeDefined()
        expect(newFailingNamedJob2).toBeDefined()
        expect(newFailingNamedJob2.status).toBe(JobStatus.WAITING)
        expect(newFailingNamedJob2.data).toEqual({ test: 'test2' })
        expect(newFailingNamedJob2.id).toBe(failingNamedJob2.id)
        expect(newFailingNamedJob2.name).toBe(NAMED_TEST_JOB_2)

        // Start processing the first named job
        await sleep(100)

        let failingNamedJob1AfterProcessing = await queue.getJob(failingNamedJob1.id)

        expect(failingNamedJob1AfterProcessing).toBeDefined()
        expect(failingNamedJob1AfterProcessing.status).toBe(JobStatus.PROCESSING)
        expect(failingNamedJob1AfterProcessing.id).toBe(failingNamedJob1.id)
        expect(failingNamedJob1AfterProcessing.data).toEqual({ test: 'test1' })
        expect(failingNamedJob1AfterProcessing.name).toBe(NAMED_TEST_JOB_1)
        expect(failingNamedJob1AfterProcessing.resultData).toBeNull()

        expect(namedTestConsumer.testRun1).toHaveBeenCalledTimes(2)
        expect(namedTestConsumer.testRun1).toHaveBeenCalledWith(failingNamedJob1AfterProcessing)
        expect(namedTestConsumer.handler1).toHaveBeenCalledTimes(2)
        expect(namedTestConsumer.handler1).toHaveBeenCalledWith(failingNamedJob1AfterProcessing)
        expect(namedTestConsumer.onActive).toHaveBeenCalledTimes(3)
        expect(namedTestConsumer.onActive).toHaveBeenCalledWith(failingNamedJob1AfterProcessing, {
          test: 'test1',
        })

        // Finish processing the first named job and start processing the second named job
        await sleep(200)

        let failingNamedJob1AfterFailed = await queue.getJob(failingNamedJob1.id)

        expect(failingNamedJob1AfterFailed).toBeDefined()
        expect(failingNamedJob1AfterFailed.status).toBe(JobStatus.FAILED)
        expect(failingNamedJob1AfterFailed.id).toBe(failingNamedJob1.id)
        expect(failingNamedJob1AfterFailed.data).toEqual({ test: 'test1' })
        expect(failingNamedJob1AfterFailed.name).toBe(NAMED_TEST_JOB_1)
        expect(failingNamedJob1AfterFailed.resultData).toBeNull()

        expect(namedTestConsumer.onFailed).toHaveBeenCalledTimes(1)
        expect(namedTestConsumer.onFailed).toHaveBeenCalledWith(
          failingNamedJob1AfterFailed,
          new Error('Test error')
        )

        let failingNamedJob2AfterProcessing = await queue.getJob(failingNamedJob2.id)

        expect(failingNamedJob2AfterProcessing).toBeDefined()
        expect(failingNamedJob2AfterProcessing.status).toBe(JobStatus.PROCESSING)
        expect(failingNamedJob2AfterProcessing.id).toBe(failingNamedJob2.id)
        expect(failingNamedJob2AfterProcessing.data).toEqual({ test: 'test2' })
        expect(failingNamedJob2AfterProcessing.name).toBe(NAMED_TEST_JOB_2)
        expect(failingNamedJob2AfterProcessing.resultData).toBeNull()

        expect(namedTestConsumer.testRun2).toHaveBeenCalledTimes(2)
        expect(namedTestConsumer.testRun2).toHaveBeenCalledWith(failingNamedJob2AfterProcessing)
        expect(namedTestConsumer.handler2).toHaveBeenCalledTimes(2)
        expect(namedTestConsumer.handler2).toHaveBeenCalledWith(failingNamedJob2AfterProcessing)
        expect(namedTestConsumer.onActive).toHaveBeenCalledTimes(4)
        expect(namedTestConsumer.onActive).toHaveBeenCalledWith(failingNamedJob2AfterProcessing, {
          test: 'test2',
        })

        // Finish processing the second named job
        await sleep(200)
        let failingNamedJob2AfterFailed = await queue.getJob(failingNamedJob2.id)

        expect(failingNamedJob2AfterFailed).toBeDefined()
        expect(failingNamedJob2AfterFailed.status).toBe(JobStatus.FAILED)
        expect(failingNamedJob2AfterFailed.id).toBe(failingNamedJob2.id)
        expect(failingNamedJob2AfterFailed.data).toEqual({ test: 'test2' })
        expect(failingNamedJob2AfterFailed.name).toBe(NAMED_TEST_JOB_2)
        expect(failingNamedJob2AfterFailed.resultData).toBeNull()

        expect(namedTestConsumer.onFailed).toHaveBeenCalledTimes(2)
        expect(namedTestConsumer.onFailed).toHaveBeenCalledWith(
          failingNamedJob2AfterFailed,
          new Error('Test error 2')
        )

        expect(namedTestConsumer.onDone).toHaveBeenCalledTimes(2)
      })
    })
  })
})
