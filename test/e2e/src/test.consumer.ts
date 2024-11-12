import { Logger } from '@nestjs/common'
import { log } from 'console'
import { TestService } from './test.service'
import { JobStatus, OnWorkerEvent, Process, Processor, type Job } from '../../../src/'
import { TEST_QUEUE } from '../sqlite-queue.module.spec'

@Processor()
export class TestConsumer {
  private readonly logger = new Logger(TestConsumer.name)

  constructor(private testService: TestService) {}

  @Process()
  async handler(job: Job) {
    return this.testRun()
  }

  testRun() {
    return this.testService.testRun()
  }

  @OnWorkerEvent(JobStatus.PROCESSING)
  onActive(job: Job) {}

  @OnWorkerEvent(JobStatus.DONE)
  onDone(job: Job) {}

  @OnWorkerEvent(JobStatus.FAILED)
  onFailed(job: Job) {}
}
