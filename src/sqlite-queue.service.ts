import { Injectable } from '@nestjs/common'
import { JobModel } from './models/job.model'
import { Op, Sequelize, Transaction, WhereOptions } from 'sequelize'
import { JobNotFoundError } from './sqlite-queue.errors'
import {
  JobStatus,
  type CreateJobOptions,
  type Job,
  type JSONObject,
  type JSONValue,
} from './sqlite-queue.interfaces'
import {
  SQLITE_QUEUE_DEFAULT_JOB_FAIL_ON_STALLED,
  SQLITE_QUEUE_DEFAULT_JOB_RETRIES,
  SQLITE_QUEUE_DEFAULT_JOB_TIMEOUT,
} from './sqlite-queue.constants'

@Injectable()
export class SQLiteQueue {
  private _isPaused: boolean = false

  constructor(private readonly job: typeof JobModel) {}

  async getJob(id: number, tx?: Transaction): Promise<Job | null> {
    const job = await this.job.findByPk(id, {
      plain: true,
      transaction: tx,
    })

    if (!job) {
      throw new JobNotFoundError(`Job with id ${id} not found`)
    }

    return job.dataValues
  }

  async createJob(data: JSONValue, options?: CreateJobOptions, tx?: Transaction): Promise<Job>
  async createJob(
    name: string,
    data: JSONObject,
    options?: CreateJobOptions,
    tx?: Transaction
  ): Promise<Job>

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

    let retries = options.retries ?? SQLITE_QUEUE_DEFAULT_JOB_RETRIES
    let timeout = options.timeout ?? SQLITE_QUEUE_DEFAULT_JOB_TIMEOUT
    let failOnTimeout = options.failOnTimeout ?? SQLITE_QUEUE_DEFAULT_JOB_FAIL_ON_STALLED
    let processAfter = options.processAfter ?? null

    const job = await this.job.create(
      {
        name,
        data,
        status: JobStatus.WAITING,
        retries,
        timeout,
        failOnTimeout,
        processAfter,
      },
      { transaction: tx }
    )

    return job.dataValues
  }

  async createJobBulk(
    jobs: Array<{ name?: string; data?: JSONObject; jobOptions?: CreateJobOptions }>,
    tx?: Transaction
  ): Promise<Job[]> {
    let newJobs = await this.job.bulkCreate(
      jobs.map((job) => ({
        name: job.name ?? null,
        data: job.data ?? null,
        status: JobStatus.WAITING,
        retries: job?.jobOptions?.retries ?? SQLITE_QUEUE_DEFAULT_JOB_RETRIES,
        timeout: job?.jobOptions?.timeout ?? SQLITE_QUEUE_DEFAULT_JOB_TIMEOUT,
        failOnTimeout: job?.jobOptions?.failOnTimeout ?? SQLITE_QUEUE_DEFAULT_JOB_FAIL_ON_STALLED,
      })),
      { transaction: tx }
    )

    return newJobs.map((job) => job.dataValues ?? null)
  }

  async getFirstNewJob(name: string, tx?: Transaction): Promise<Job | null>
  async getFirstNewJob(tx?: Transaction): Promise<Job | null>
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
      order: [['createdAt', 'ASC']],
      plain: true,
      transaction: tx,
    })

    return job?.dataValues ?? null
  }

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

  async removeJob(id: number, tx?: Transaction): Promise<Job> {
    let job = await this.job.findByPk(id, { transaction: tx })

    if (!job) {
      throw new JobNotFoundError(`Job with id ${id} not found`)
    }

    await job.destroy({ transaction: tx })

    return job.dataValues
  }

  async createTransaction(
    type: Transaction.TYPES = Transaction.TYPES.IMMEDIATE
  ): Promise<Transaction> {
    return this.job.sequelize.transaction({ type })
  }

  async getConnection(): Promise<Sequelize> {
    return this.job.sequelize
  }

  async getJobTable(): Promise<typeof JobModel> {
    return this.job
  }

  setPaused(paused: boolean) {
    this._isPaused = paused
  }

  isPaused() {
    return this._isPaused
  }
}
