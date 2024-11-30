import { EventEmitter } from 'node:events'
import { type SQLiteQueueConfig, WorkerEvent, SQLiteQueue, SQLiteQueueWorker, Job } from '../src'
import { JobTimeoutError } from '../src/sqlite-queue.errors'

jest.useFakeTimers()

describe('SQLiteQueueWorker', () => {
  let worker: SQLiteQueueWorker
  let queue: SQLiteQueue
  let eventEmitter: EventEmitter
  let config: SQLiteQueueConfig

  beforeEach(async () => {
    jest.clearAllMocks()
    config = {}
    queue = {
      isPaused: jest.fn().mockReturnValue(false),
      createTransaction: jest.fn().mockResolvedValue({
        commit: jest.fn().mockResolvedValue(undefined),
      }),
      getFirstNewJob: jest.fn().mockResolvedValue(null),
      markAsProcessing: jest.fn().mockResolvedValue(null),
      markAsProcessed: jest.fn().mockResolvedValue(null),
      markAsFailed: jest.fn().mockResolvedValue(null),
    } as any

    eventEmitter = new EventEmitter()
    worker = new SQLiteQueueWorker(config, queue, eventEmitter)
  })

  it('should be defined', () => {
    expect(worker).toBeDefined()
  })

  describe('consumeEvents', () => {
    it('should consume events periodically', async () => {
      const consumeEventsSpy = jest.spyOn(worker as any, 'consumeEvents')

      jest.advanceTimersByTime(1100)
      expect(consumeEventsSpy).toHaveBeenCalled()
      expect(consumeEventsSpy).toHaveBeenCalledTimes(1)

      jest.advanceTimersByTime(1100)
      expect(consumeEventsSpy).toHaveBeenCalledTimes(2)
    })
  })

  describe('findFirstAndMarkAsProcessing', () => {
    it('should return null if no new job is found', async () => {
      queue.getFirstNewJob = jest.fn().mockResolvedValue(null)

      const result = await (worker as any).findFirstAndMarkAsProcessing()

      expect(result).toBeNull()

      expect(queue.markAsProcessing).not.toHaveBeenCalled()
    })

    it('should not emit a PROCESSING event if no job is found', async () => {
      queue.getFirstNewJob = jest.fn().mockResolvedValue(null)
      const emitSpy = jest.spyOn(eventEmitter, 'emit')

      await (worker as any).findFirstAndMarkAsProcessing()

      expect(emitSpy).not.toHaveBeenCalled()
    })

    it('should return the first new job and mark it as processing in a transaction', async () => {
      const job: Job = { id: 1, name: 'testJob' } as any
      const transaction = { commit: jest.fn().mockResolvedValue(undefined) }
      queue.getFirstNewJob = jest.fn().mockResolvedValue(job)
      queue.markAsProcessing = jest.fn().mockResolvedValue(job)
      queue.createTransaction = jest.fn().mockResolvedValue(transaction)

      const result = await (worker as any).findFirstAndMarkAsProcessing()

      expect(result).toEqual(job)
      expect(queue.getFirstNewJob).toHaveBeenCalledWith(transaction)
      expect(transaction.commit).toHaveBeenCalled()

      expect(queue.markAsProcessing).toHaveBeenCalledWith(job.id, transaction)
    })

    it('should emit a PROCESSING event for the job', async () => {
      const data = { test: 'data' }
      const job: Job = { id: 1, data: data } as any
      const transaction = { commit: jest.fn().mockResolvedValue(undefined) }
      queue.getFirstNewJob = jest.fn().mockResolvedValue(job)
      queue.markAsProcessing = jest.fn().mockResolvedValue(job)
      queue.createTransaction = jest.fn().mockResolvedValue(transaction)
      const emitSpy = jest.spyOn(worker as any, 'emitWorkerEvent')

      await (worker as any).findFirstAndMarkAsProcessing()

      expect(emitSpy).toHaveBeenCalledWith(job, WorkerEvent.PROCESSING, data)
    })

    it('should increment activeJobs if maxParallelJobs is set', async () => {
      const job: Job = { id: 1 } as any
      const transaction = { commit: jest.fn().mockResolvedValue(undefined) }
      queue.getFirstNewJob = jest.fn().mockResolvedValue(job)
      queue.markAsProcessing = jest.fn().mockResolvedValue(job)
      queue.createTransaction = jest.fn().mockResolvedValue(transaction)

      worker['maxParallelJobs'] = 2

      const result = await (worker as any).findFirstAndMarkAsProcessing()

      expect(result).toEqual(job)
      expect(worker['activeJobs']).toBe(1)
    })

    it('should return null if the worker is paused', async () => {
      queue.isPaused = jest.fn().mockReturnValue(true)

      const result = await (worker as any).findFirstAndMarkAsProcessing()

      expect(result).toBeNull()
      expect(queue.markAsProcessing).not.toHaveBeenCalled()
    })

    it('should return null if maxParallelJobs is reached and not start processing a job', async () => {
      const job: Job = { id: 1 } as any
      queue.getFirstNewJob = jest.fn().mockResolvedValue(job)
      queue.createTransaction = jest
        .fn()
        .mockResolvedValue({ commit: jest.fn().mockResolvedValue(undefined) })

      worker['activeJobs'] = 2
      worker['maxParallelJobs'] = 2

      const result = await (worker as any).findFirstAndMarkAsProcessing()

      expect(result).toBeNull()
      expect(queue.markAsProcessing).not.toHaveBeenCalled()
    })
  })

  describe('handleJob', () => {
    it('should handle unnamed job by calling the defaultHandler', async () => {
      const job: Job = { id: 1 } as any
      const defaultHandlerSpy = jest
        .spyOn(worker as any, 'defaultHandler')
        .mockResolvedValue('result')

      const result = await (worker as any).handleJob(job)

      expect(result).toBe('result')
      expect(defaultHandlerSpy).toHaveBeenCalledWith(job)
    })

    it('should handle named jobs by calling the named handler for a job', async () => {
      const job: Job = { id: 1, name: 'testJob' } as any
      worker['testJob'] = jest.fn()
      const testJobSpy = jest.spyOn(worker as any, 'testJob').mockResolvedValue('result')

      const result = await (worker as any).handleJob(job)

      expect(result).toBe('result')
      expect(testJobSpy).toHaveBeenCalledWith(job)
    })

    it('should throw an error if no handler is found', async () => {
      const job: Job = { id: 1, name: 'unknownJob' } as any

      await expect((worker as any).handleJob(job)).rejects.toThrow(
        `Processor method not found for a named job: ${job.name}. When using named jobs, you must use the 
          @Processor('jobName') decorator to create processors for each unique name added to a queue`
      )
    })

    it('should fail with a timeout error if the job times out', async () => {
      const job: Job = { id: 1 } as any
      worker['jobTimeout'] = 100

      const defaultHandlerSpy = jest
        .spyOn(worker as any, 'defaultHandler')
        .mockImplementation(
          () => new Promise((resolve, _) => setTimeout(() => resolve('test'), 200))
        )

      expect.assertions(1)
      ;(worker as any).handleJob(job).catch((error) => {
        expect(error).toBeInstanceOf(JobTimeoutError)
      })
      jest.advanceTimersByTime(1000)
    })
  })

  describe('completeJob', () => {
    it('should mark a job as processed and emit a DONE event', async () => {
      const job: Job = { id: 1 } as any
      const result = 'result'
      queue.markAsProcessed = jest.fn().mockResolvedValue(job)

      const completedJob = await (worker as any).completeJob(job, result)

      expect(completedJob).toEqual(job)
      expect(queue.markAsProcessed).toHaveBeenCalledWith(job.id, result)
    })

    it('should emit a DONE event for the job', async () => {
      const job: Job = { id: 1 } as any
      queue.markAsProcessed = jest.fn().mockResolvedValue(job)
      const emitSpy = jest.spyOn(worker as any, 'emitWorkerEvent')

      let testResult = { testResultData: 'result' }
      await (worker as any).completeJob(job, testResult)

      expect(emitSpy).toHaveBeenCalledWith(job, WorkerEvent.DONE, testResult)
    })
  })

  describe('handleFailure', () => {
    it('should mark a job as failed and emit a FAILED event', async () => {
      const job: Job = { id: 1 } as any
      queue.markAsFailed = jest.fn().mockResolvedValue(job)
      queue.markAsStalled = jest.fn().mockResolvedValue(job)

      let testError = new Error('test error')
      const result = await (worker as any).handleFailure(job, testError)

      expect(result).toEqual(job)
      expect(queue.markAsFailed).toHaveBeenCalledWith(job.id, testError)
      expect(queue.markAsStalled).not.toHaveBeenCalled()
    })

    it('should emit an ERROR event for the job', async () => {
      const job: Job = { id: 1 } as any
      queue.markAsFailed = jest.fn().mockResolvedValue(job)
      const emitSpy = jest.spyOn(worker as any, 'emitWorkerEvent')

      let testError = new Error('test error')
      await (worker as any).handleFailure(job, testError)

      expect(emitSpy).toHaveBeenCalledWith(job, WorkerEvent.ERROR, testError)
    })

    it('should emit a FAILED event for the job', async () => {
      const job: Job = { id: 1 } as any
      queue.markAsFailed = jest.fn().mockResolvedValue(job)
      const emitSpy = jest.spyOn(worker as any, 'emitWorkerEvent')

      let testError = new Error('test error')
      await (worker as any).handleFailure(job, testError)

      expect(emitSpy).toHaveBeenCalledWith(job, WorkerEvent.FAILED, testError)
    })

    it('should mark a job as stalled and if the job is not set to fail on timeout', async () => {
      const job: Job = { id: 1, failOnTimeout: false } as any
      queue.markAsStalled = jest.fn().mockResolvedValue(job)
      queue.markAsFailed = jest.fn().mockResolvedValue(job)

      let testTimmeoutError = new JobTimeoutError('test error')
      const result = await (worker as any).handleFailure(job, testTimmeoutError)

      expect(result).toEqual(job)
      expect(queue.markAsStalled).toHaveBeenCalledWith(job.id)
      expect(queue.markAsFailed).not.toHaveBeenCalled()
    })

    it('should emit a STALLED event for the job  if the job is not set to fail on timeout', async () => {
      const job: Job = { id: 1, failOnTimeout: false } as any
      queue.markAsStalled = jest.fn().mockResolvedValue(job)
      const emitSpy = jest.spyOn(worker as any, 'emitWorkerEvent')

      let testTimmeoutError = new JobTimeoutError('test error')
      await (worker as any).handleFailure(job, testTimmeoutError)

      expect(emitSpy).toHaveBeenCalledWith(job, WorkerEvent.STALLED)
    })

    it('should mark the job as failed if the job is set to fail on timeout', async () => {
      const job: Job = { id: 1, failOnTimeout: true } as any
      queue.markAsFailed = jest.fn().mockResolvedValue(job)

      let testTimmeoutError = new JobTimeoutError('test error')
      const result = await (worker as any).handleFailure(job, testTimmeoutError)

      expect(result).toEqual(job)
      expect(queue.markAsFailed).toHaveBeenCalledWith(job.id, testTimmeoutError)
    })

    it('should not emit a STALLED event if the job is set to fail on timeout', async () => {
      const job: Job = { id: 1, failOnTimeout: true } as any
      queue.markAsFailed = jest.fn().mockResolvedValue(job)
      const emitSpy = jest.spyOn(worker as any, 'emitWorkerEvent')

      let testTimmeoutError = new JobTimeoutError('test error')
      await (worker as any).handleFailure(job, testTimmeoutError)

      expect(emitSpy).not.toHaveBeenCalledWith(job, WorkerEvent.STALLED)
    })

    it('should mark a job for retry if retries are available', async () => {
      const job: Job = { id: 1, retries: 3, retriesAttempted: 2 } as any
      queue.markForRetry = jest.fn().mockResolvedValue(job)

      let testError = new Error('test error')
      const result = await (worker as any).handleFailure(job, testError)

      expect(result).toEqual(job)
      expect(queue.markForRetry).toHaveBeenCalledWith(job.id)
    })

    it('should not mark a job for retry if no retries are available', async () => {
      const job: Job = { id: 1, retries: 3, retriesAttempted: 3 } as any
      queue.markForRetry = jest.fn().mockResolvedValue(job)
      queue.markAsFailed = jest.fn().mockResolvedValue(job)

      let testError = new Error('test error')
      const result = await (worker as any).handleFailure(job, testError)

      expect(result).toEqual(job)
      expect(queue.markForRetry).not.toHaveBeenCalled()
      expect(queue.markAsFailed).toHaveBeenCalledWith(job.id, testError)
    })
  })

  describe('emitWorkerEvent', () => {
    it('should emit worker events', () => {
      const job: Job = { id: 1 } as any
      const emitSpy = jest.spyOn(eventEmitter, 'emit')

      ;(worker as any).emitWorkerEvent(job, WorkerEvent.PROCESSING)

      expect(emitSpy).toHaveBeenCalledWith(expect.any(String), job)
    })
  })
})
