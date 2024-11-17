import { TestService } from './test.service'
import { JobStatus, OnWorkerEvent, Process, Processor, type Job } from '../../../src/'

@Processor()
export class TestConsumer {
  constructor(private testService: TestService) {}

  @Process()
  async handler(job: Job) {
    return this.testRun(job)
  }

  testRun(job?: Job) {
    return this.testService.testRun()
  }

  @OnWorkerEvent(JobStatus.PROCESSING)
  onActive(job: Job) {
    this.testService.testOnActive(job)
  }

  @OnWorkerEvent(JobStatus.DONE)
  onDone(job: Job) {
    this.testService.testOnDone(job)
  }

  @OnWorkerEvent(JobStatus.FAILED)
  onFailed(job: Job) {
    this.testService.testOnFailed(job)
  }
}
