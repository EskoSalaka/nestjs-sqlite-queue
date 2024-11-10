import { Injectable } from '@nestjs/common'
import { JobModel, JobStatus, type Job } from './models/job.model'
import type { Sequelize, Transaction, WhereOptions } from 'sequelize'

export interface CreateJobOptions {
  jobName?: string | null | undefined
  jobData: JobModel['data'] | null
}

@Injectable()
export class SQLiteQueueService {
  constructor(private readonly job: typeof JobModel) {}

  async getJob(id: Job['id'], tx?: Transaction): Promise<Job | null> {
    const job = (await this.job.findByPk(id, {
      raw: true,
      plain: true,
      transaction: tx,
    })) as Job | null

    return job
  }

  async createJob(name?: Job['name'], data?: Job['data'], tx?: Transaction): Promise<Job | null> {
    const job = (await this.job.create(
      {
        name: name || null,
        data: data || null,
        status: JobStatus.NEW,
      },
      {
        raw: true,
        plain: true,
        transaction: tx,
      }
    )) as Job

    return job
  }

  async getLatestNewJob(name: Job['name'], tx?: Transaction): Promise<Job | null>
  async getLatestNewJob(tx?: Transaction): Promise<Job | null>
  async getLatestNewJob(
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

    const job = (await this.job.findOne({
      where,
      order: [['createdAt', 'ASC']],
      raw: true,
      plain: true,
      transaction: tx,
    })) as Job | null

    return job
  }

  async markAsNew(id: Job['id'], tx?: Transaction): Promise<Job | null> {
    const job = await this.job.findByPk(id, { transaction: tx })

    if (!job) {
      return null
    }

    job.status = JobStatus.NEW
    job.updatedAt = new Date()

    await job.save({ transaction: tx })

    return job.toJSON()
  }

  async markAsProcessing(id: Job['id'], tx?: Transaction): Promise<Job | null> {
    const job = await this.job.findByPk(id, { transaction: tx })

    if (!job) {
      return null
    }

    await job.update(
      {
        status: JobStatus.PROCESSING,
        processingAt: new Date(),
        updatedAt: new Date(),
      },
      { transaction: tx }
    )

    return job.toJSON()
  }

  async markAsProcessed(
    id: Job['id'],
    resultData?: Job['resultData'],
    tx?: Transaction
  ): Promise<Job | null> {
    const job = await this.job.findByPk(id, { transaction: tx })

    if (!job) {
      return null
    }

    await job.update(
      {
        status: JobStatus.DONE,
        resultData,
        updatedAt: new Date(),
      },
      { transaction: tx }
    )

    return job.toJSON()
  }

  async markAsFailed(id: Job['id'], tx?: Transaction): Promise<Job | null> {
    const job = await this.job.findByPk(id, { transaction: tx })

    if (!job) {
      return null
    }

    await job.update(
      {
        status: JobStatus.FAILED,
        updatedAt: new Date(),
        failedAt: new Date(),
      },
      { transaction: tx }
    )

    return job.toJSON()
  }

  async markAsStalled(id: Job['id'], tx?: Transaction): Promise<Job | null> {
    const job = await this.job.findByPk(id, { transaction: tx })

    if (!job) {
      return null
    }

    await job.update(
      {
        status: JobStatus.STALLED,
        updatedAt: new Date(),
        stalledAt: new Date(),
      },
      { transaction: tx }
    )

    return job.toJSON()
  }

  async createTransaction(): Promise<Transaction> {
    return this.job.sequelize.transaction()
  }

  async getConnection(): Promise<Sequelize> {
    return this.job.sequelize
  }

  async getModel() {
    return this.job
  }
}
