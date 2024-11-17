import { Injectable } from '@nestjs/common'
import { JobModel, JobStatus, type Job } from './models/job.model'
import { Sequelize, Transaction, WhereOptions } from 'sequelize'
import { JobNotFoundError } from './sqlite-queue'

export interface CreateJobOptions {
  jobName?: string | null | undefined
  jobData: JobModel['data'] | null
}

@Injectable()
export class SQLiteQueue {
  private _isPaused: boolean = false

  constructor(private readonly job: typeof JobModel) {}

  async getJob(id: Job['id'], tx?: Transaction): Promise<Job | null> {
    const job = await this.job.findByPk(id, {
      plain: true,
      transaction: tx,
    })

    if (!job) {
      throw new JobNotFoundError(`Job with id ${id} not found`)
    }

    return job.dataValues
  }

  async createJob(jobData: JobModel['data'] | null, tx?: Transaction): Promise<Job>
  async createJob(jobName: string, jobData: JobModel['data'] | null, tx?: Transaction): Promise<Job>

  async createJob(
    jobNameOrData: Job['name'] | JobModel['data'] | null,
    jobDataOrTx?: JobModel['data'] | Transaction | null,
    tx?: Transaction
  ): Promise<Job | null> {
    let jobName: Job['name'] | undefined
    let jobData: JobModel['data'] | null = null

    if (typeof jobNameOrData === 'string') {
      jobName = jobNameOrData
      jobData = jobDataOrTx as JobModel['data'] | null
    } else {
      jobData = jobNameOrData
      tx = jobDataOrTx as Transaction
    }

    const job = await this.job.create(
      {
        name: jobName ?? null,
        data: jobData,
        status: JobStatus.NEW,
      },
      { transaction: tx }
    )

    return job.dataValues
  }

  async getFirstNewJob(name: Job['name'], tx?: Transaction): Promise<Job | null>
  async getFirstNewJob(tx?: Transaction): Promise<Job | null>
  async getFirstNewJob(
    nameOrTx?: Job['name'] | Transaction,
    tx?: Transaction
  ): Promise<Job | null> {
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

  async markAsNew(id: Job['id'], tx?: Transaction): Promise<Job | null> {
    const job = await this.job.findByPk(id, { transaction: tx })

    if (!job) {
      throw new JobNotFoundError(`Job with id ${id} not found`)
    }

    job.status = JobStatus.NEW
    job.updatedAt = new Date()

    await job.save({ transaction: tx })

    return job.dataValues
  }

  async markAsProcessing(id: Job['id'], tx?: Transaction): Promise<Job | null> {
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
    id: Job['id'],
    resultData?: Job['resultData'],
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

  async markAsFailed(id: Job['id'], tx?: Transaction): Promise<Job | null> {
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

  async markAsStalled(id: Job['id'], tx?: Transaction): Promise<Job | null> {
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

  async removeJob(id: Job['id'], tx?: Transaction): Promise<Job> {
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
