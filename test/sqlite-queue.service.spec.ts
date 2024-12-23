import { Test, TestingModule } from '@nestjs/testing'
import {
  createJobModel,
  createSequelizeConnection,
  JobNotFoundError,
  SQLITE_QUEUE_DEFAULT_JOB_FAIL_ON_STALLED,
  SQLITE_QUEUE_DEFAULT_JOB_RETRIES,
  SQLITE_QUEUE_DEFAULT_JOB_TIMEOUT,
  JobStatus,
  JobModel,
  SQLiteQueue,
} from '../src'
import * as crypto from 'crypto'
import { sleep } from './e2e/src/util'
import { Sequelize } from 'sequelize'

describe('SQLiteQueue', () => {
  let connection: Sequelize
  let queue: SQLiteQueue
  let jobModel: typeof JobModel

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        {
          provide: Sequelize,
          useFactory: async () => {
            return createSequelizeConnection({
              storage: ':memory:',
            })
          },
        },
        {
          provide: SQLiteQueue,
          useFactory: async (connection: Sequelize) => {
            let model = await createJobModel('default_queue', connection, { force: false })

            let sqliteQueue = new SQLiteQueue(model as typeof JobModel)
            return sqliteQueue
          },
          inject: [Sequelize],
        },
      ],
    }).compile()

    connection = module.get<Sequelize>(Sequelize)
    queue = module.get<SQLiteQueue>(SQLiteQueue)
    jobModel = connection.model('default_queue') as unknown as typeof JobModel
  })

  afterEach(async () => {
    await jobModel.truncate()
  })

  afterAll(async () => {
    await connection.close()
  })

  it('should be defined', () => {
    expect(queue).toBeDefined()
  })

  describe('createJob', () => {
    it('should add an unnamed job with data to the queue', async () => {
      let job = await queue.createJob({ data: { test: 'test' } })

      expect(job).toBeDefined()
      expect(job.id).toBeDefined()
      expect(job.name).toBe(null)
      expect(job.status).toBe(JobStatus.WAITING)
      expect(job.data).toEqual({ data: { test: 'test' } })
      expect(job.retries).toBe(SQLITE_QUEUE_DEFAULT_JOB_RETRIES)
      expect(job.retriesAttempted).toBe(0)
      expect(job.timeout).toBe(SQLITE_QUEUE_DEFAULT_JOB_TIMEOUT)
      expect(job.failOnTimeout).toBe(SQLITE_QUEUE_DEFAULT_JOB_FAIL_ON_STALLED)
      expect(job.processAfter).toBe(null)
      expect(job.priority).toBe(0)

      let jobs = await jobModel.findAll()
      expect(jobs).toHaveLength(1)

      let createdJob = jobs[0]
      expect(createdJob.dataValues).toEqual(job)
    })

    it('should add a named job with data to the queue', async () => {
      let job = await queue.createJob('test', { data: { test: 'test' } })

      expect(job).toBeDefined()
      expect(job.id).toBeDefined()
      expect(job.name).toBe('test')
      expect(job.status).toBe(JobStatus.WAITING)
      expect(job.data).toEqual({ data: { test: 'test' } })
      expect(job.retries).toBe(SQLITE_QUEUE_DEFAULT_JOB_RETRIES)
      expect(job.retriesAttempted).toBe(0)
      expect(job.timeout).toBe(SQLITE_QUEUE_DEFAULT_JOB_TIMEOUT)
      expect(job.failOnTimeout).toBe(SQLITE_QUEUE_DEFAULT_JOB_FAIL_ON_STALLED)
      expect(job.processAfter).toBe(null)
      expect(job.priority).toBe(0)

      let jobs = await jobModel.findAll()
      expect(jobs).toHaveLength(1)

      let createdJob = jobs[0]
      expect(createdJob.dataValues).toEqual(job)
    })

    it('should add a job with options to the queue', async () => {
      let processAfter = new Date()
      let job = await queue.createJob(
        { data: { test: 'test' } },
        { retries: 3, timeout: 1000, failOnTimeout: true, processAfter: processAfter, priority: 3 }
      )

      expect(job).toBeDefined()
      expect(job.id).toBeDefined()
      expect(job.name).toBe(null)
      expect(job.status).toBe(JobStatus.WAITING)
      expect(job.retriesAttempted).toBe(0)
      expect(job.retries).toBe(3)
      expect(job.timeout).toBe(1000)
      expect(job.failOnTimeout).toBe(true)
      expect(job.processAfter).toEqual(processAfter)
      expect(job.priority).toBe(3)

      let jobs = await jobModel.findAll()
      expect(jobs).toHaveLength(1)

      let createdJob = jobs[0]
      expect(createdJob.dataValues).toEqual(job)
    })

    it('should add a named job with options to the queue', async () => {
      let processAfter = new Date()
      let job = await queue.createJob(
        'test',
        { data: { test: 'test' } },
        { retries: 3, timeout: 1000, failOnTimeout: true, processAfter: processAfter, priority: 3 }
      )

      expect(job).toBeDefined()
      expect(job.id).toBeDefined()
      expect(job.name).toBe('test')
      expect(job.data).toEqual({ data: { test: 'test' } })
      expect(job.status).toBe(JobStatus.WAITING)
      expect(job.retries).toBe(3)
      expect(job.retriesAttempted).toBe(0)
      expect(job.timeout).toBe(1000)
      expect(job.failOnTimeout).toBe(true)
      expect(job.processAfter).toEqual(processAfter)
      expect(job.priority).toBe(3)

      let jobs = await jobModel.findAll()
      expect(jobs).toHaveLength(1)

      let createdJob = jobs[0]
      expect(createdJob.dataValues).toEqual(job)
    })
  })

  describe('getJob', () => {
    it('should get a job by id', async () => {
      let job = await queue.createJob('test', {})
      let fetchedJob = await queue.getJob(job.id)

      expect(fetchedJob).toEqual(job)
    })

    it('should throw an error if job is not found', async () => {
      let id = 1
      await expect(queue.getJob(id)).rejects.toThrow(`Job with id ${id} not found`)
      await expect(queue.getJob(id)).rejects.toThrow(JobNotFoundError)
    })
  })

  describe('getFirstNewJob', () => {
    it('should get the first new job added to the queue', async () => {
      let UUID = crypto.randomUUID()
      let notToBeFoundUUID = crypto.randomUUID()

      let firstJob = await queue.createJob({})

      // Add some more jobs to the queue. The first one shall be found
      await queue.createJob(UUID, {})
      await queue.createJob(UUID, {})
      await queue.createJob(notToBeFoundUUID, {})
      await queue.createJob(notToBeFoundUUID, {})

      let fetchedJob = await queue.getFirstNewJob()

      expect(fetchedJob).toEqual(firstJob)
    })

    it('should not get the first job in the queue with processAfter set in the future', async () => {
      let futureDate = new Date('2050-01-01T00:00:00.000Z')
      let newJob = await queue.createJob({}, { processAfter: futureDate })

      expect(newJob).toBeDefined()
      expect(newJob.id).toBeDefined()
      expect(newJob.status).toBe(JobStatus.WAITING)
      expect(newJob.processAfter).toEqual(futureDate)

      let fetchedJob = await queue.getFirstNewJob()
      expect(fetchedJob).toEqual(null)
    })

    it('should get the correct first job in the queue with processAfter set in the past', async () => {
      let futureDate = new Date('2050-01-01T00:00:00.000Z')
      let pastDate = new Date('2013-01-01T00:00:00.000Z')

      let newJob = await queue.createJob({}, { processAfter: pastDate })
      await queue.createJob({}, {})
      await queue.createJob({}, { processAfter: futureDate })

      expect(newJob).toBeDefined()
      expect(newJob.id).toBeDefined()
      expect(newJob.status).toBe(JobStatus.WAITING)
      expect(newJob.processAfter).toEqual(pastDate)

      let fetchedJob = await queue.getFirstNewJob()
      expect(fetchedJob).toEqual(newJob)
    })

    it('should get the first new job added to the queue by name', async () => {
      let UUID = crypto.randomUUID()
      let notToBeFoundUUID = crypto.randomUUID()

      let firstJob = await queue.createJob(UUID, {})

      // Add some more jobs to the queue. The first one shall be found
      await queue.createJob(UUID, {})
      await queue.createJob(UUID, {})
      await queue.createJob(notToBeFoundUUID, {})
      await queue.createJob(notToBeFoundUUID, {})

      let fetchedJob = await queue.getFirstNewJob(UUID)

      expect(fetchedJob).toEqual(firstJob)
    })

    it('should get the first new job added to the queue with priority', async () => {
      // Add some more jobs to the queue. The first one shall be found
      await queue.createJob({}, { priority: 1 })
      await queue.createJob({}, { priority: 2 })

      let firstJob = await queue.createJob({}, { priority: 3 })
      let fetchedJob = await queue.getFirstNewJob()

      expect(fetchedJob).toEqual(firstJob)

      // Add some more jobs to the queue. The first one shall be found
      await queue.createJob({}, { priority: 1 })
      await queue.createJob({}, { priority: 2 })

      fetchedJob = await queue.getFirstNewJob()

      expect(fetchedJob).toEqual(firstJob)

      // Add a job with higher priority
      firstJob = await queue.createJob({}, { priority: 4 })
      fetchedJob = await queue.getFirstNewJob()

      expect(fetchedJob).toEqual(firstJob)
    })

    it('should return null if no job is found', async () => {
      let fetchedJob = await queue.getFirstNewJob()

      expect(fetchedJob).toBeNull()
    })

    it('should return null if no job is found by name', async () => {
      let UUID = crypto.randomUUID()
      let fetchedJob = await queue.getFirstNewJob(UUID)

      expect(fetchedJob).toBeNull()
    })

    it('should return null if no job is found by name when the queue contains other named and unnamed jobs', async () => {
      let UUID = crypto.randomUUID()
      let anotherUUID = crypto.randomUUID()
      let notToBeFoundUUID = crypto.randomUUID()

      // Add some more jobs to the queue. The first one shall be found
      await queue.createJob({})
      await queue.createJob({})
      await queue.createJob(UUID, {})
      await queue.createJob(UUID, {})
      await queue.createJob(anotherUUID, {})
      await queue.createJob(anotherUUID, {})

      let fetchedJob = await queue.getFirstNewJob(notToBeFoundUUID)

      expect(fetchedJob).toBeNull()
    })
  })

  describe('markAsWaiting', () => {
    it('should mark a job as waiting', async () => {
      let job = await queue.createJob({})

      let waitingJob = await queue.markAsWaiting(job.id)

      expect(waitingJob.id).toBe(job.id)
      expect(waitingJob.status).toBe(JobStatus.WAITING)

      let jobInDb = await jobModel.findOne({ where: { id: job.id } })
      expect(jobInDb.dataValues).toEqual(waitingJob)
    })

    it('should update its timestamp fields', async () => {
      let job = await queue.createJob({})
      await jobModel.update({ status: JobStatus.PROCESSING }, { where: { id: job.id } })
      let jobInDb = await jobModel.findOne({ where: { id: job.id } })
      expect(jobInDb.status).toBe(JobStatus.PROCESSING)

      let waitingJob = await queue.markAsWaiting(job.id)

      expect(waitingJob.id).toBe(job.id)

      expect(waitingJob.updatedAt.getMilliseconds()).toBeGreaterThan(
        job.updatedAt.getMilliseconds()
      )
    })

    it('should throw an error if job is not found', async () => {
      let id = 1
      await expect(queue.markAsWaiting(id)).rejects.toThrow(`Job with id ${id} not found`)
      await expect(queue.markAsWaiting(id)).rejects.toThrow(JobNotFoundError)
    })
  })

  describe('markAsProcessing', () => {
    it('should mark a job as processing', async () => {
      let job = await queue.createJob({})
      let processedJob = await queue.markAsProcessing(job.id)

      expect(processedJob.id).toBe(job.id)
      expect(processedJob.status).toBe(JobStatus.PROCESSING)

      let jobInDb = await jobModel.findOne({ where: { id: job.id } })
      expect(jobInDb.dataValues).toEqual(processedJob)
    })

    it('should update its timestamp fields', async () => {
      let job = await queue.createJob({})
      await sleep(10)
      let processedJob = await queue.markAsProcessing(job.id)

      expect(processedJob.id).toBe(job.id)

      expect(processedJob.processingAt).toBeDefined()
      expect(processedJob.processingAt.getMilliseconds()).toBeGreaterThan(
        job.createdAt.getMilliseconds()
      )
      expect(processedJob.updatedAt.getMilliseconds()).toBeGreaterThan(
        job.updatedAt.getMilliseconds()
      )
    })

    it('should throw an error if job is not found', async () => {
      let id = 1
      await expect(queue.markAsProcessing(id)).rejects.toThrow(`Job with id ${id} not found`)
      await expect(queue.markAsProcessing(id)).rejects.toThrow(JobNotFoundError)
    })
  })

  describe('markAsProcessed', () => {
    it('should mark a job as processed with result data', async () => {
      let job = await queue.createJob({})
      let result = { data: { test: 'test' } }
      let processedJob = await queue.markAsProcessed(job.id, result)

      expect(processedJob.id).toBe(job.id)
      expect(processedJob.status).toBe(JobStatus.DONE)

      let jobInDb = await jobModel.findOne({ where: { id: job.id } })
      expect(jobInDb.dataValues).toEqual(processedJob)
    })

    it('should update its timestamp fields', async () => {
      let job = await queue.createJob({})
      await sleep(10)
      let processedJob = await queue.markAsProcessed(job.id, {})

      expect(processedJob.id).toBe(job.id)
      expect(processedJob.doneAt).toBeDefined()
      expect(processedJob.doneAt.getMilliseconds()).toBeGreaterThan(
        processedJob.createdAt.getMilliseconds()
      )
      expect(processedJob.updatedAt.getMilliseconds()).toBeGreaterThan(
        job.updatedAt.getMilliseconds()
      )
    })

    it('should throw an error if job is not found', async () => {
      let id = 1
      await expect(queue.markAsProcessed(id, {})).rejects.toThrow(`Job with id ${id} not found`)
      await expect(queue.markAsProcessed(id, {})).rejects.toThrow(JobNotFoundError)
    })
  })

  describe('markAsFailed', () => {
    it('should mark a job as failed and updated its timestamp fields', async () => {
      let job = await queue.createJob({})
      let failedJob = await queue.markAsFailed(job.id)

      expect(failedJob.id).toBe(job.id)
      expect(failedJob.status).toBe(JobStatus.FAILED)

      let jobInDb = await jobModel.findOne({ where: { id: job.id } })
      expect(jobInDb.dataValues).toEqual(failedJob)
    })

    it('should mark a job as failed with error data', async () => {
      let job = await queue.createJob({})
      let error = new Error('test error')
      error.stack = 'test stack'
      let failedJob = await queue.markAsFailed(job.id, error)

      expect(failedJob.id).toBe(job.id)
      expect(failedJob.status).toBe(JobStatus.FAILED)
      expect(failedJob.errorMessage).toBe(error.message)
      expect(failedJob.errorStack).toBe(error.stack)
    })

    it('should update its timestamp fields', async () => {
      let job = await queue.createJob({})
      await sleep(10)
      let failedJob = await queue.markAsFailed(job.id)

      expect(failedJob.id).toBe(job.id)

      expect(failedJob.failedAt).toBeDefined()
      expect(failedJob.failedAt.getMilliseconds()).toBeGreaterThan(
        failedJob.createdAt.getMilliseconds()
      )
      expect(failedJob.updatedAt.getMilliseconds()).toBeGreaterThan(job.updatedAt.getMilliseconds())
    })

    it('should throw an error if job is not found', async () => {
      let id = 1
      await expect(queue.markAsFailed(id)).rejects.toThrow(`Job with id ${id} not found`)
      await expect(queue.markAsFailed(id)).rejects.toThrow(JobNotFoundError)
    })
  })

  describe('markAsStalled', () => {
    it('should mark a job as stalled and updated its timestamp fields', async () => {
      let job = await queue.createJob({})
      await sleep(10)
      let stalledJob = await queue.markAsStalled(job.id)

      expect(stalledJob.id).toBe(job.id)
      expect(stalledJob.status).toBe(JobStatus.STALLED)

      let jobInDb = await jobModel.findOne({ where: { id: job.id } })
      expect(jobInDb.dataValues).toEqual(stalledJob)
    })

    it('should update its timestamp fields', async () => {
      let job = await queue.createJob({})
      await sleep(10)
      let stalledJob = await queue.markAsStalled(job.id)

      expect(stalledJob.id).toBe(job.id)

      expect(stalledJob.stalledAt).toBeDefined()
      expect(stalledJob.stalledAt.getMilliseconds()).toBeGreaterThan(
        stalledJob.createdAt.getMilliseconds()
      )
      expect(stalledJob.updatedAt.getMilliseconds()).toBeGreaterThan(
        job.updatedAt.getMilliseconds()
      )
    })

    it('should throw an error if job is not found', async () => {
      let id = 1
      await expect(queue.markAsStalled(id)).rejects.toThrow(`Job with id ${id} not found`)
      await expect(queue.markAsStalled(id)).rejects.toThrow(JobNotFoundError)
    })
  })

  describe('markForRetry', () => {
    it('should mark a job for retry', async () => {
      let job = await queue.createJob({})
      let jobInDb = await jobModel.findOne({ where: { id: job.id } })
      expect(job.retriesAttempted).toBe(0)
      expect(jobInDb.retriesAttempted).toEqual(0)

      let retriedJob = await queue.markForRetry(job.id)

      expect(retriedJob.id).toBe(job.id)
      expect(retriedJob.status).toBe(JobStatus.WAITING)
      expect(retriedJob.retriesAttempted).toBe(1)

      jobInDb = await jobModel.findOne({ where: { id: job.id } })
      expect(jobInDb.dataValues).toEqual(retriedJob)

      await queue.markForRetry(job.id)

      let retriedJobInDb = await jobModel.findOne({ where: { id: job.id } })
      expect(retriedJobInDb.retriesAttempted).toBe(2)
    })

    it('should update its timestamp fields', async () => {
      let job = await queue.createJob({})
      await sleep(10)
      let retriedJob = await queue.markForRetry(job.id)

      expect(retriedJob.id).toBe(job.id)

      expect(retriedJob.updatedAt.getMilliseconds()).toBeGreaterThan(
        job.updatedAt.getMilliseconds()
      )
    })

    it('should throw an error if job is not found', async () => {
      let id = 1
      await expect(queue.markForRetry(id)).rejects.toThrow(`Job with id ${id} not found`)
      await expect(queue.markForRetry(id)).rejects.toThrow(JobNotFoundError)
    })
  })

  describe('removeJob', () => {
    it('should remove a job from the queue', async () => {
      let job = await queue.createJob({})
      let jobInDb = await jobModel.findByPk(job.id)

      expect(jobInDb.id).toEqual(job.id)

      await queue.removeJob(job.id)

      let jobs = await jobModel.findAll()
      expect(jobs).toHaveLength(0)
    })

    it('should throw an error if job is not found', async () => {
      let id = 1
      await expect(queue.removeJob(id)).rejects.toThrow(`Job with id ${id} not found`)
      await expect(queue.removeJob(id)).rejects.toThrow(JobNotFoundError)
    })
  })

  describe('createJobBulk', () => {
    it('should add multiple jobs to the queue', async () => {
      let jobs = [
        { data: { test: 'test' } },
        { data: { test: 'test' } },
        { data: { test: 'test' } },
      ]

      let createdJobs = await queue.createJobBulk(jobs)

      expect(createdJobs).toHaveLength(3)

      let jobsInDb = await jobModel.findAll()
      expect(jobsInDb).toHaveLength(3)
      expect(jobsInDb.map((job) => job.dataValues)).toEqual(createdJobs)

      jobsInDb.forEach((job) => {
        expect(createdJobs).toContainEqual(job.dataValues)
        expect(job.name).toBe(null)
        expect(job.status).toBe(JobStatus.WAITING)
        expect(job.retries).toBe(SQLITE_QUEUE_DEFAULT_JOB_RETRIES)
        expect(job.retriesAttempted).toBe(0)
        expect(job.timeout).toBe(SQLITE_QUEUE_DEFAULT_JOB_TIMEOUT)
        expect(job.failOnTimeout).toBe(SQLITE_QUEUE_DEFAULT_JOB_FAIL_ON_STALLED)
      })
    })

    it('should add multiple named jobs to the queue with options', async () => {
      let processAfter = new Date()
      let jobs = [
        {
          name: 'test',
          data: { test: 'test' },
          jobOptions: {
            retries: 3,
            timeout: 1000,
            failOnTimeout: true,
            processAfter: processAfter,
            priority: 3,
          },
        },
        {
          name: 'test',
          data: { test: 'test' },
          jobOptions: {
            retries: 3,
            timeout: 1000,
            failOnTimeout: true,
            processAfter: processAfter,
            priority: 3,
          },
        },
        {
          name: 'test',
          data: { test: 'test' },
          jobOptions: {
            retries: 3,
            timeout: 1000,
            failOnTimeout: true,
            processAfter: processAfter,
            priority: 3,
          },
        },
      ]

      let createdJobs = await queue.createJobBulk(jobs)

      expect(createdJobs).toHaveLength(3)

      let jobsInDb = await jobModel.findAll()
      expect(jobsInDb).toHaveLength(3)
      expect(jobsInDb.map((job) => job.dataValues)).toEqual(createdJobs)

      jobsInDb.forEach((job) => {
        expect(createdJobs).toContainEqual(job.dataValues)
        expect(job.name).toBe('test')
        expect(job.status).toBe(JobStatus.WAITING)
        expect(job.retries).toBe(3)
        expect(job.retriesAttempted).toBe(0)
        expect(job.timeout).toBe(1000)
        expect(job.failOnTimeout).toBe(true)
        expect(job.processAfter).toEqual(processAfter)
        expect(job.priority).toBe(3)
      })
    })
  })

  describe('setPaused', () => {
    it('should pause and unpause the queue', async () => {
      expect(queue.isPaused()).toBe(false)
      queue.setPaused(true)
      expect(queue.isPaused()).toBe(true)

      queue.setPaused(false)
      expect(queue.isPaused()).toBe(false)
    })
  })

  describe('getConnection', () => {
    it('should return the connection', async () => {
      let queueConnection = await queue.getConnection()

      expect(queueConnection).toBeDefined()
      expect(queueConnection).toBeInstanceOf(Sequelize)
      expect(queueConnection).toBe(connection)
    })
  })

  describe('getJobTable', () => {
    it('should return the model', async () => {
      let queueModel = await queue.getJobTable()

      expect(queueModel).toBeDefined()
      expect(queueModel).toBe(jobModel)
    })
  })
})
