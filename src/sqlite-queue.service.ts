import { Injectable } from '@nestjs/common'
import { JobModel } from './models/job.model'
import { Op, Sequelize, Transaction, WhereOptions, type TransactionOptions } from 'sequelize'
import { JobNotFoundError } from './sqlite-queue.errors'
import {
  JobStatus,
  type CreateJobOptions,
  type Job,
  type JSONObject,
} from './sqlite-queue.interfaces'

@Injectable()
export class SQLiteQueue {
  private _isPaused: boolean = false

  constructor(private readonly job: typeof JobModel) {}

  /**
   * Get a job by id
   *
   * @param {number} id - the id of the job to get
   * @param {Transaction} tx - optional transaction to run the query in
   * @return {Promise<Job>} - the job with the given id
   * @throws {JobNotFoundError} if job with id not found
   */
  async getJob(id: number, tx?: Transaction): Promise<Job> {
    const job = await this.job.findByPk(id, {
      plain: true,
      transaction: tx,
    })

    if (!job) {
      throw new JobNotFoundError(`Job with id ${id} not found`)
    }

    return job.dataValues
  }

  /**
   * Create
   */
  async createJob(data: JSONObject, options?: CreateJobOptions, tx?: Transaction): Promise<Job>

  /**
   * Create a new job in the queue. The job will be created with status WAITING
   * and will be processed by the queue depending on the options provided (or as soon as possible).
   *
   * @param {JSONObject} data - the data to be processed by the job
   * @param {CreateJobOptions} options - options for the job
   * @param {Transaction} tx - optional transaction to run the query in
   * @return {Promise<Job>} - the created job
   * @throws {JobNotFoundError} - if job with id not found
   */
  async createJob(
    name: string,
    data: JSONObject,
    options?: CreateJobOptions,
    tx?: Transaction
  ): Promise<Job>

  /**
   * Create a new job in the queue. The job will be created with status WAITING
   * and will be processed by the queue depending on the options provided (or as soon as possible).
   *
   * A named job can be created by providing a name of the job as the first argument. Named jobs will
   * be processed only by workers that are listening for that specific job name.
   *
   *
   * @param {string} name - the name of the job
   * @param {JSONObject} data - the data to be processed by the job
   * @param {CreateJobOptions} options - options for the job
   * @param {Transaction} tx - optional transaction to run the query in
   */
  async createJob(
    nameOrData: JSONObject | string,
    dataOrOptions?: JSONObject | CreateJobOptions,
    optionsOrTx?: CreateJobOptions | Transaction,
    tx?: Transaction
  ): Promise<Job> {
    let name: string
    let data: JSONObject
    let options: CreateJobOptions

    if (typeof nameOrData === 'string') {
      name = nameOrData
      data = dataOrOptions as JSONObject
      options = (optionsOrTx as CreateJobOptions) ?? {}
    } else {
      name = null
      data = nameOrData as JSONObject
      options = (dataOrOptions as CreateJobOptions) ?? {}
    }

    const job = await this.job.create(
      {
        name,
        data,
        status: JobStatus.WAITING,
        ...options,
      },
      { transaction: tx }
    )

    return job.dataValues
  }

  /**
   * Create multiple jobs in the queue
   *
   * @param {Array<{ name?: string; data?: JSONObject; jobOptions?: CreateJobOptions }>} jobs - the jobs to create
   * @param {Transaction} tx - optional transaction to run the query in
   */
  async createJobBulk(
    jobs: Array<{ name?: string; data?: JSONObject; jobOptions?: CreateJobOptions }>,
    tx?: Transaction
  ): Promise<Job[]> {
    let newJobs = await this.job.bulkCreate(
      jobs.map((job) => ({
        name: job.name ?? null,
        data: job.data ?? null,
        status: JobStatus.WAITING,
        ...(job?.jobOptions ?? {}),
      })),
      { transaction: tx }
    )

    return newJobs.map((job) => job.dataValues ?? null)
  }

  /**
   * Get the first job that is waiting to be processed (if the queue has any)
   *
   * @param {string} name - the name of the job to get
   * @param {Transaction} tx - optional transaction to run the query in
   * @return {Promise<Job | null>} - the first (if the queue has any) job that is waiting to be processed
   */
  async getFirstNewJob(name: string, tx?: Transaction): Promise<Job | null>

  /**
   * Get the first job that is waiting to be processed (if the queue has any)
   *
   * @param {Transaction} tx - optional transaction to run the query in
   * @return {Promise<Job | null>} - the first (if the queue has any) job that is waiting to be processed
   */
  async getFirstNewJob(tx?: Transaction): Promise<Job | null>

  /**
   * Get the first job that is waiting to be processed (if the queue has any)
   *
   * @param {string} name - the name of the job to get
   * @param {Transaction} tx - optional transaction to run the query in
   * @return {Promise<Job | null>} - the first (if the queue has any) job that is waiting to be processed
   */
  async getFirstNewJob(nameOrTx?: string | Transaction, tx?: Transaction): Promise<Job | null> {
    let where: WhereOptions = {
      status: JobStatus.WAITING,
      processAfter: {
        [Op.or]: {
          [Op.lt]: new Date(),
          [Op.eq]: null,
        },
      },
    }

    if (typeof nameOrTx === 'string') {
      where.name = nameOrTx
    } else if (nameOrTx) {
      tx = nameOrTx
    }

    const job = await this.job.findOne({
      where,
      order: [
        ['priority', 'DESC'],
        ['id', 'ASC'],
      ],
      plain: true,
      transaction: tx,
    })

    return job?.dataValues ?? null
  }

  /**
   * Mark a job as waiting to be processed. This will basically reset the job status to WAITING and
   * will make the job available for processing by the queue.
   *
   * @param {number} id - the id of the job to mark as waiting
   * @param {Transaction} tx - optional transaction to run the query in
   * @return {Promise<Job | null>} - the updated job
   * @throws {JobNotFoundError} - if job with id not found
   */
  async markAsWaiting(id: number, tx?: Transaction): Promise<Job | null> {
    const job = await this.job.findByPk(id, { transaction: tx })

    if (!job) {
      throw new JobNotFoundError(`Job with id ${id} not found`)
    }

    let updateDate = new Date()
    await job.update(
      {
        status: JobStatus.WAITING,
        updatedAt: updateDate,
      },
      { transaction: tx }
    )

    return job.dataValues
  }

  /**
   * Mark a job as processing. This will update the job status to PROCESSING and will set the processingAt
   * field to the current date.
   *
   * @param {number} id - the id of the job to mark as processing
   * @param {Transaction} tx - optional transaction to run the query in
   * @return {Promise<Job | null>} - the updated job
   * @throws {JobNotFoundError} - if job with id not found
   */
  async markAsProcessing(id: number, tx?: Transaction): Promise<Job | null> {
    const job = await this.job.findByPk(id, { transaction: tx })

    if (!job) {
      throw new JobNotFoundError(`Job with id ${id} not found`)
    }

    let updateDate = new Date()
    await job.update(
      {
        status: JobStatus.PROCESSING,
        updatedAt: updateDate,
        processingAt: updateDate,
      },
      { transaction: tx }
    )

    return job.dataValues
  }

  /**
   * Mark a job as processed. This will update the job status to DONE and will set the doneAt field to the
   * current date. Optionally, a resultData object can be provided to store the result of the job processing.
   *
   * @param {number} id - the id of the job to mark as processed
   * @param {JSONObject} resultData - the result data of the job processing
   * @param {Transaction} tx - optional transaction to run the query in
   * @return {Promise<Job | null>} - the updated job
   * @throws {JobNotFoundError} - if job with id not found
   */
  async markAsProcessed(
    id: number,
    resultData?: JSONObject,
    tx?: Transaction
  ): Promise<Job | null> {
    const job = await this.job.findByPk(id, { transaction: tx })

    if (!job) {
      throw new JobNotFoundError(`Job with id ${id} not found`)
    }

    let updateDate = new Date()
    await job.update(
      {
        status: JobStatus.DONE,
        resultData,
        updatedAt: updateDate,
        doneAt: updateDate,
      },
      { transaction: tx }
    )

    return job.dataValues
  }

  /**
   * Mark a job as failed. This will update the job status to FAILED and will set the failedAt field to the
   * current date. Optionally, an error object can be provided to store the error message and stack trace.
   *
   * @param {number} id - the id of the job to mark as failed
   * @param {Error} error - the error object to store the error message and stack trace
   * @param {Transaction} tx - optional transaction to run the query in
   * @return {Promise<Job | null>} - the updated job
   * @throws {JobNotFoundError} - if job with id not found
   */
  async markAsFailed(id: number, error?: Error | unknown, tx?: Transaction): Promise<Job | null> {
    const job = await this.job.findByPk(id, { transaction: tx })

    if (!job) {
      throw new JobNotFoundError(`Job with id ${id} not found`)
    }

    let updateDate = new Date()
    let errorMessage = error instanceof Error ? error.message : null
    let errorStack = error instanceof Error ? error.stack : null
    await job.update(
      {
        status: JobStatus.FAILED,
        errorMessage,
        errorStack,
        updatedAt: updateDate,
        failedAt: updateDate,
      },
      { transaction: tx }
    )

    return job.dataValues
  }

  /**
   * Mark a job as stalled. This will update the job status to STALLED and will set the stalledAt field to the
   * current date.
   *
   * A job is considered stalled if it has been in the PROCESSING status for a long time and the worker
   * processing the job has not marked it as processed or failed.
   *
   * @param {number} id - the id of the job to mark as stalled
   * @param {Transaction} tx - optional transaction to run the query in
   * @return {Promise<Job | null>} - the updated job
   * @throws {JobNotFoundError} - if job with id not found
   */
  async markAsStalled(id: number, tx?: Transaction): Promise<Job | null> {
    const job = await this.job.findByPk(id, { transaction: tx })

    if (!job) {
      throw new JobNotFoundError(`Job with id ${id} not found`)
    }

    let updateDate = new Date()
    await job.update(
      {
        status: JobStatus.STALLED,
        updatedAt: updateDate,
        stalledAt: updateDate,
      },
      { transaction: tx }
    )

    return job.dataValues
  }

  /**
   * Mark the job to be retried. This will update the job status to WAITING and will increment the retriesAttempted
   * field by 1. The job will be processed by the queue depending on the options provided (or as soon as possible).
   *
   * @param {number} id - the id of the job to mark as cancelled
   * @param {Transaction} tx - optional transaction to run the query in
   * @return {Promise<Job | null>} - the updated job
   * @throws {JobNotFoundError} - if job with id not found
   */
  async markForRetry(id: number, tx?: Transaction): Promise<Job | null> {
    const job = await this.job.findByPk(id, { transaction: tx })

    if (!job) {
      throw new JobNotFoundError(`Job with id ${id} not found`)
    }

    await job.update(
      {
        status: JobStatus.WAITING,
        retriesAttempted: job.retriesAttempted + 1,
        updatedAt: new Date(),
      },
      { transaction: tx }
    )

    return job.dataValues
  }

  /**
   * Permanently remove a job from the queue.
   *
   * @param {number} id - the id of the job to remove
   * @param {Transaction} tx - optional transaction to run the query in
   * @return {Promise<Job>} - the removed job
   * @throws {JobNotFoundError} - if job with id not found
   */
  async removeJob(id: number, tx?: Transaction): Promise<Job> {
    let job = await this.job.findByPk(id, { transaction: tx })

    if (!job) {
      throw new JobNotFoundError(`Job with id ${id} not found`)
    }

    await job.destroy({ transaction: tx })

    return job.dataValues
  }

  /**
   * Creates a new transaction
   *
   * @param {Transaction.TYPES} type - the type of transaction to create, defaults to Transaction.TYPES.DEFERRED
   * @return {Promise<Transaction>} - the created transaction
   */
  async createTransaction(
    type: Transaction.TYPES = Transaction.TYPES.DEFERRED
  ): Promise<Transaction> {
    return this.job.sequelize.transaction({ type })
  }

  /**
   * Run a callback in a transaction. This is basically a Sequelize transaction wrapper and is the preferred
   * way of running queries in the database when transactions are required.
   *
   * @param {TransactionOptions} opts - options for the transaction
   * @param {Function} callback - the callback to run in the transaction
   * @return {Promise<T>} - the result of the callback
   */
  async runInTransaction<T>(
    opts: TransactionOptions,
    callback: (tx: Transaction) => Promise<T>
  ): Promise<T> {
    return this.job.sequelize.transaction(opts, async (tx: Transaction) => {
      return callback(tx)
    })
  }

  /**
   * Get the underlying Sequelize connection of the queue. With the connection, you have full access to the Sequelize
   * instance and can run any queries or operations that are not supported by the service.
   */
  async getConnection(): Promise<Sequelize> {
    return this.job.sequelize
  }

  /**
   * Get the underlying Sequelize model of the queue. With the model, you have full access to the Sequelize
   * Job table and can run any queries or operations that are not supported by the service.
   *
   * @return {Promise<typeof JobModel>} - the JobModel
   *
   */
  async getJobTable(): Promise<typeof JobModel> {
    return this.job
  }

  /**
   * Pause the queue. When the queue is paused, no new jobs will be processed by the queue.
   *
   * @param {boolean} paused - whether to pause or resume the queue
   */
  setPaused(paused: boolean) {
    this._isPaused = paused
  }

  /**
   * Check if the queue is paused
   *
   * @return {boolean} - whether the queue is paused
   */
  isPaused(): boolean {
    return this._isPaused
  }
}
