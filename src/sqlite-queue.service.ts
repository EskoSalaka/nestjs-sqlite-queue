import { Injectable } from '@nestjs/common'
import { JobModel, JobStatus, type Job, type JSONObject, type JSONValue } from './models/job.model'
import { Sequelize, Transaction, WhereOptions } from 'sequelize'
import { JobNotFoundError } from './sqlite-queue.errors'
import type { CreateJobOptions } from './sqlite-queue.interfaces'

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

    const job = await this.job.create(
      {
        name,
        data,
        status: JobStatus.NEW,
        ...options,
      },
      { transaction: tx }
    )

    return job.dataValues
  }

  async getFirstNewJob(name: string, tx?: Transaction): Promise<Job | null>
  async getFirstNewJob(tx?: Transaction): Promise<Job | null>
  async getFirstNewJob(nameOrTx?: string | Transaction, tx?: Transaction): Promise<Job | null> {
    let where: WhereOptions = {
      status: JobStatus.NEW,
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

  async markAsNew(id: number, tx?: Transaction): Promise<Job | null> {
    const job = await this.job.findByPk(id, { transaction: tx })

    if (!job) {
      throw new JobNotFoundError(`Job with id ${id} not found`)
    }

    job.status = JobStatus.NEW
    job.updatedAt = new Date()

    await job.save({ transaction: tx })

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

  async markAsFailed(id: number, tx?: Transaction): Promise<Job | null> {
    const job = await this.job.findByPk(id, { transaction: tx })

    if (!job) {
      throw new JobNotFoundError(`Job with id ${id} not found`)
    }

    let updateDate = new Date()
    await job.update(
      {
        status: JobStatus.FAILED,
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

  async removeJob(id: number, tx?: Transaction): Promise<Job> {
    let job = await this.job.findByPk(id, { transaction: tx })

    if (!job) {
      throw new JobNotFoundError(`Job with id ${id} not found`)
    }

    await job.destroy({ transaction: tx })

    return job.dataValues
  }

  async createTransaction(): Promise<Transaction> {
    return this.job.sequelize.transaction({ type: Transaction.TYPES.IMMEDIATE })
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
