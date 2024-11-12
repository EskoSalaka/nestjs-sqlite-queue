import { Logger } from '@nestjs/common'
import { log } from 'console'
import { TestService } from './test.service'
import { JobStatus, OnWorkerEvent, Process, Processor } from '../../../src/'

@Processor('NAMED_JOBS_TEST_QUEUE')
export class TestConsumerWithNamedJobs {
  private readonly logger = new Logger(TestConsumerWithNamedJobs.name)

  constructor(private testService: TestService) {}

  @Process('NAMED_TEST_JOB_1')
  async handler1(job) {
    return this.testService.testRun()
  }

  @Process('NAMED_TEST_JOB_2')
  async handler2(job) {
    return this.testService.testRun2()
  }

  test() {
    log('test')
  }

  @OnWorkerEvent(JobStatus.PROCESSING)
  onActive() {}

  @OnWorkerEvent(JobStatus.DONE)
  onDone() {}

  @OnWorkerEvent(JobStatus.FAILED)
  onFailed() {}
}
