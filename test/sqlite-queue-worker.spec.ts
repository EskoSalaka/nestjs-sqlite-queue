import { EventEmitter } from 'node:events'
import {
  type SQLiteQueueConfig,
  WorkerEvent,
  SQLiteQueue,
  SQLiteQueueWorker,
  Job,
  getWorkerEventName,
  SQLITE_QUEUE_DEFAULT_QUEUE_NAME,
} from '../src'
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
      runInTransaction: jest.fn().mockImplementation((opts, transactionCallback) => {
        return transactionCallback()
      }),

      getFirstNewJob: jest.fn().mockResolvedValue(null),
      markAsProcessing: jest.fn().mockResolvedValue(null),
      markAsProcessed: jest.fn().mockResolvedValue(null),
      markAsFailed: jest.fn().mockResolvedValue(null),
      removeJob: jest.fn().mockResolvedValue(null),
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

    it('should process a new job if the worker is not paused and maxParallelJobs is not reached', async () => {
      let testJob = { id: 1, removeOnComplete: false }
      let testResult = { testResultData: 'result' }
      let findFirstAndMarkAsProcessingSpy = jest
        .spyOn(worker as any, 'findFirstAndMarkAsProcessing')
        .mockResolvedValue(testJob)

      let handleJobSpy = jest.spyOn(worker as any, 'handleJob').mockResolvedValue(testResult)
      let handleFailureSpy = jest.spyOn(worker as any, 'handleFailure')
      let completeJobSpy = jest.spyOn(worker as any, 'completeJob').mockResolvedValue(testJob)

      ;(worker as any).activeJobs = 0
      ;(worker as any).maxParallelJobs = 10

      await (worker as any).consumeEvents()

      expect(findFirstAndMarkAsProcessingSpy).toHaveBeenCalled()
      expect(handleJobSpy).toHaveBeenCalledWith(testJob)
      expect(completeJobSpy).toHaveBeenCalledWith(testJob, testResult)
      expect(handleFailureSpy).not.toHaveBeenCalled()
    })

    it('should process and handle a failure of a job if the worker is not paused and maxParallelJobs is not reached', async () => {
      let testJob = { id: 1, removeOnFail: false }
      let testError = new Error('test error')
      let findFirstAndMarkAsProcessingSpy = jest
        .spyOn(worker as any, 'findFirstAndMarkAsProcessing')
        .mockResolvedValue(testJob)

      let handleJobSpy = jest.spyOn(worker as any, 'handleJob').mockRejectedValue(testError)
      let handleFailureSpy = jest.spyOn(worker as any, 'handleFailure').mockResolvedValue(testJob)
      let completeJobSpy = jest.spyOn(worker as any, 'completeJob')

      ;(worker as any).activeJobs = 0
      ;(worker as any).maxParallelJobs = 10

      await (worker as any).consumeEvents()

      expect(findFirstAndMarkAsProcessingSpy).toHaveBeenCalled()
      expect(handleJobSpy).toHaveBeenCalledWith(testJob)
      expect(completeJobSpy).not.toHaveBeenCalled()
      expect(handleFailureSpy).toHaveBeenCalledWith(testJob, testError)
    })

    it('should not process a new job if the maxParallelJobs is reached', async () => {
      let testJob = { id: 1 }
      let testResult = { testResultData: 'result' }
      let findFirstAndMarkAsProcessingSpy = jest
        .spyOn(worker as any, 'findFirstAndMarkAsProcessing')
        .mockResolvedValue(testJob)

      let handleJobSpy = jest.spyOn(worker as any, 'handleJob').mockResolvedValue(testResult)
      let handleFailureSpy = jest.spyOn(worker as any, 'handleFailure')
      let completeJobSpy = jest.spyOn(worker as any, 'completeJob')

      ;(worker as any).activeJobs = 10
      ;(worker as any).maxParallelJobs = 10

      await (worker as any).consumeEvents()

      expect(findFirstAndMarkAsProcessingSpy).not.toHaveBeenCalled()
      expect(handleJobSpy).not.toHaveBeenCalled()
      expect(completeJobSpy).not.toHaveBeenCalled()
      expect(handleFailureSpy).not.toHaveBeenCalled()
    })

    it('should emit a DRAINED event when the queue is empty and DRAINED has not yet been emitted', async () => {
      const emitSpy = jest.spyOn(worker as any, 'emitWorkerEvent')
      queue.getFirstNewJob = jest.fn().mockResolvedValue(null)
      ;(worker as any).drained = false
      ;(worker as any).activeJobs = 0

      await (worker as any).consumeEvents()

      expect(emitSpy).toHaveBeenCalledWith(null, WorkerEvent.DRAINED)
      expect((worker as any).drained).toBe(true)
    })

    it('should not emit a DRAINED event when the queue is empty and DRAINED has already been emitted', async () => {
      const emitSpy = jest.spyOn(worker as any, 'emitWorkerEvent')
      queue.getFirstNewJob = jest.fn().mockResolvedValue(null)
      ;(worker as any).drained = true
      ;(worker as any).activeJobs = 0

      await (worker as any).consumeEvents()

      expect(emitSpy).not.toHaveBeenCalledWith(null, WorkerEvent.DRAINED)
    })

    it('should not emit a DRAINED event when the queue is not empty', async () => {
      const emitSpy = jest.spyOn(worker as any, 'emitWorkerEvent')
      queue.getFirstNewJob = jest.fn().mockResolvedValue({ id: 1 })
      ;(worker as any).drained = false
      ;(worker as any).activeJobs = 10

      await (worker as any).consumeEvents()

      expect(emitSpy).not.toHaveBeenCalledWith(null, WorkerEvent.DRAINED)
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

      queue.getFirstNewJob = jest.fn().mockResolvedValue(job)
      queue.markAsProcessing = jest.fn().mockResolvedValue(job)

      const result = await (worker as any).findFirstAndMarkAsProcessing()

      expect(result).toEqual(job)
    })

    it('should emit a PROCESSING event for the job', async () => {
      const data = { test: 'data', removeOnComplete: true }
      const job: Job = { id: 1, data: data } as any
      const transaction = { commit: jest.fn().mockResolvedValue(undefined) }
      queue.getFirstNewJob = jest.fn().mockResolvedValue(job)
      queue.markAsProcessing = jest.fn().mockResolvedValue(job)
      queue.createTransaction = jest.fn().mockResolvedValue(transaction)
      const emitSpy = jest.spyOn(worker as any, 'emitWorkerEvent')

      await (worker as any).findFirstAndMarkAsProcessing()

      expect(emitSpy).toHaveBeenCalledWith(job, WorkerEvent.PROCESSING, data)
    })

    it('should handle errors gracefully when handleJob throws', async () => {
      const job: Job = { id: 1, name: 'testJob', removeOnFail: true } as any
      jest.spyOn(worker as any, 'findFirstAndMarkAsProcessing').mockResolvedValueOnce(job)
      jest.spyOn(worker as any, 'handleJob').mockRejectedValue(new Error('test error'))
      jest.spyOn(queue as any, 'markAsFailed').mockResolvedValue(job)

      expect(await (worker as any).consumeEvents()).toBeUndefined()
    })

    it('should handle errors gracefully when findFirstAndMarkAsProcessing throws', async () => {
      const job: Job = { id: 1, name: 'testJob' } as any
      jest
        .spyOn(worker as any, 'findFirstAndMarkAsProcessing')
        .mockRejectedValue(new Error('test error'))

      await expect((worker as any).consumeEvents()).resolves.toBeUndefined()
    })

    it('should handle errors gracefully when completeJob throws', async () => {
      const job: Job = { id: 1, name: 'testJob', removeOnComplete: true } as any
      jest.spyOn(worker as any, 'findFirstAndMarkAsProcessing').mockResolvedValue(job)
      jest.spyOn(worker as any, 'handleJob').mockResolvedValue('result')
      jest.spyOn(worker as any, 'completeJob').mockRejectedValue(new Error('test error'))

      expect(await (worker as any).consumeEvents()).toBeUndefined()
    })

    it('should handle errors gracefully when handleFailure throws', async () => {
      const job: Job = { id: 1, name: 'testJob', removeOnFail: true } as any
      jest.spyOn(worker as any, 'findFirstAndMarkAsProcessing').mockResolvedValue(job)
      jest.spyOn(worker as any, 'handleJob').mockRejectedValue(new Error('test error'))
      jest.spyOn(worker as any, 'handleFailure').mockRejectedValue(new Error('test error'))

      expect(await (worker as any).consumeEvents()).toBeUndefined()
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

    it('should remove the job if removeOnComplete is set', async () => {
      const job: Job = { id: 1, removeOnComplete: true } as any
      const result = 'result'
      queue.markAsProcessed = jest.fn().mockResolvedValue(job)
      queue.removeJob = jest.fn().mockResolvedValue(undefined)

      const completedJob = await (worker as any).completeJob(job, result)

      expect(completedJob).toEqual(job)
      expect(queue.markAsProcessed).toHaveBeenCalledWith(job.id, result)

      expect(queue.removeJob).toHaveBeenCalledWith(job.id)
    })

    it('should complete gracefully without throwing if removeJob throws', async () => {
      const job: Job = { id: 1, removeOnComplete: true } as any
      const result = 'result'
      queue.markAsProcessed = jest.fn().mockResolvedValue(job)
      queue.removeJob = jest.fn().mockRejectedValue(new Error('test error'))

      expect((worker as any).completeJob(job, result)).resolves.not.toThrow()
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

    it('should remove the job if removeOnFail is set', async () => {
      const job: Job = { id: 1, removeOnFail: true } as any
      queue.markAsFailed = jest.fn().mockResolvedValue(job)
      queue.markAsStalled = jest.fn().mockResolvedValue(job)
      queue.removeJob = jest.fn().mockResolvedValue(undefined)

      let testError = new Error('test error')
      const result = await (worker as any).handleFailure(job, testError)

      expect(result).toEqual(job)
      expect(queue.markAsFailed).toHaveBeenCalledWith(job.id, testError)
      expect(queue.markAsStalled).not.toHaveBeenCalled()
      expect(queue.removeJob).toHaveBeenCalledWith(job.id)
    })

    it('should not remove the job if removeOnFail is not set', async () => {
      const job: Job = { id: 1, removeOnFail: false } as any
      queue.markAsFailed = jest.fn().mockResolvedValue(job)
      queue.markAsStalled = jest.fn().mockResolvedValue(job)
      queue.removeJob = jest.fn().mockResolvedValue(undefined)

      let testError = new Error('test error')
      const result = await (worker as any).handleFailure(job, testError)

      expect(result).toEqual(job)
      expect(queue.markAsFailed).toHaveBeenCalledWith(job.id, testError)
      expect(queue.markAsStalled).not.toHaveBeenCalled()
      expect(queue.removeJob).not.toHaveBeenCalled()
    })

    it('should complete gracefully without throwing if removeJob throws', async () => {
      const job: Job = { id: 1, removeOnFail: true } as any
      queue.markAsFailed = jest.fn().mockResolvedValue(job)
      queue.markAsStalled = jest.fn().mockResolvedValue(job)
      queue.removeJob = jest.fn().mockRejectedValue(new Error('test error'))

      let testError = new Error('test error')
      expect((worker as any).handleFailure(job, testError)).resolves.not.toThrow()
    })
  })

  describe('emitWorkerEvent', () => {
    it('should emit worker events for default queue name', () => {
      const job: Job = { id: 1 } as any
      const emitSpy = jest.spyOn(eventEmitter, 'emit')

      ;(worker as any).emitWorkerEvent(job, WorkerEvent.PROCESSING)
      expect(emitSpy).toHaveBeenCalledWith(
        getWorkerEventName(SQLITE_QUEUE_DEFAULT_QUEUE_NAME, WorkerEvent.PROCESSING),
        job
      )
      ;(worker as any).emitWorkerEvent(job, WorkerEvent.DONE)
      expect(emitSpy).toHaveBeenCalledWith(
        getWorkerEventName(SQLITE_QUEUE_DEFAULT_QUEUE_NAME, WorkerEvent.DONE),
        job
      )
      ;(worker as any).emitWorkerEvent(job, WorkerEvent.ERROR)
      expect(emitSpy).toHaveBeenCalledWith(
        getWorkerEventName(SQLITE_QUEUE_DEFAULT_QUEUE_NAME, WorkerEvent.ERROR),
        job
      )
      ;(worker as any).emitWorkerEvent(job, WorkerEvent.FAILED)
      expect(emitSpy).toHaveBeenCalledWith(
        getWorkerEventName(SQLITE_QUEUE_DEFAULT_QUEUE_NAME, WorkerEvent.FAILED),
        job
      )
      ;(worker as any).emitWorkerEvent(job, WorkerEvent.STALLED)
      expect(emitSpy).toHaveBeenCalledWith(
        getWorkerEventName(SQLITE_QUEUE_DEFAULT_QUEUE_NAME, WorkerEvent.STALLED),
        job
      )
      ;(worker as any).emitWorkerEvent(job, WorkerEvent.DRAINED)
      expect(emitSpy).toHaveBeenCalledWith(
        getWorkerEventName(SQLITE_QUEUE_DEFAULT_QUEUE_NAME, WorkerEvent.DRAINED),
        job
      )
    })

    it('should emit worker events for a custom queue name', () => {
      const job: Job = { id: 1 } as any
      const queueName = 'customQueue'
      ;(worker as any).queueName = queueName
      const emitSpy = jest.spyOn(eventEmitter, 'emit')

      ;(worker as any).emitWorkerEvent(job, WorkerEvent.PROCESSING)
      expect(emitSpy).toHaveBeenCalledWith(
        getWorkerEventName(queueName, WorkerEvent.PROCESSING),
        job
      )
      ;(worker as any).emitWorkerEvent(job, WorkerEvent.DONE)

      expect(emitSpy).toHaveBeenCalledWith(getWorkerEventName(queueName, WorkerEvent.DONE), job)
      ;(worker as any).emitWorkerEvent(job, WorkerEvent.ERROR)

      expect(emitSpy).toHaveBeenCalledWith(getWorkerEventName(queueName, WorkerEvent.ERROR), job)
      ;(worker as any).emitWorkerEvent(job, WorkerEvent.FAILED)

      expect(emitSpy).toHaveBeenCalledWith(getWorkerEventName(queueName, WorkerEvent.FAILED), job)
      ;(worker as any).emitWorkerEvent(job, WorkerEvent.STALLED)

      expect(emitSpy).toHaveBeenCalledWith(getWorkerEventName(queueName, WorkerEvent.STALLED), job)
      ;(worker as any).emitWorkerEvent(job, WorkerEvent.DRAINED)

      expect(emitSpy).toHaveBeenCalledWith(getWorkerEventName(queueName, WorkerEvent.DRAINED), job)
    })
  })
})
