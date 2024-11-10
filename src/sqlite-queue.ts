import { Injectable } from '@nestjs/common'
import { JobModel, type Job } from './models/job.model'
import { SQLiteQueueService } from './sqlite-queue.service'

@Injectable()
export class SqliteQueue {
  constructor(private sqliteQueueService: SQLiteQueueService) {}

  async createJob(jobData: JobModel['data'] | null): Promise<Job>
  async createJob(jobName: string, jobData: JobModel['data'] | null): Promise<Job>

  async createJob(
    jobNameOrData: string | JobModel['data'] | null,
    jobData?: JobModel['data'] | null
  ): Promise<Job> {
    if (typeof jobNameOrData === 'string') {
      return this.sqliteQueueService.createJob(jobNameOrData, jobData)
    } else {
      return this.sqliteQueueService.createJob(null, jobNameOrData)
    }
  }
}
