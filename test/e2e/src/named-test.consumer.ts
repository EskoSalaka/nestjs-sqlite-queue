import { Logger } from '@nestjs/common'
import { TestService } from './test.service'
import { OnWorkerEvent, Process, Processor, WorkerEvent, type Job } from '../../../src/'

@Processor('NAMED_JOBS_TEST_QUEUE')
export class TestConsumerWithNamedJobs {
  private readonly logger = new Logger(TestConsumerWithNamedJobs.name)

  constructor(private testService: TestService) {}

  @Process('NAMED_TEST_JOB_1')
  async handler1(job) {
    return this.testRun1(job)
  }

  @Process('NAMED_TEST_JOB_2')
  async handler2(job) {
    return this.testRun2(job)
  }

  testRun1(job?: Job) {
    return this.testService.testRun(job)
  }

  testRun2(job?: Job) {
    return this.testService.testRun2(job)
  }

  @OnWorkerEvent(WorkerEvent.PROCESSING)
  onActive(job: Job) {
    this.testService.testOnActive(job)
  }

  @OnWorkerEvent(WorkerEvent.DONE)
  onDone(job: Job) {
    this.testService.testOnDone()
  }

  @OnWorkerEvent(WorkerEvent.FAILED)
  onFailed(job: Job) {
    this.testService.testOnFailed(job)
  }
}
