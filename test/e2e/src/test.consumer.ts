import { TestService } from './test.service'
import { OnWorkerEvent, Process, Processor, WorkerEvent, type Job } from '../../../src/'

@Processor()
export class TestConsumer {
  constructor(private testService: TestService) {}

  @Process()
  async handler(job: Job) {
    return this.testRun(job)
  }

  testRun(job?: Job) {
    return this.testService.testRun(job)
  }

  @OnWorkerEvent(WorkerEvent.PROCESSING)
  onActive(job: Job) {
    this.testService.testOnActive(job)
  }

  @OnWorkerEvent(WorkerEvent.DONE)
  onDone(job: Job) {
    this.testService.testOnDone(job)
  }

  @OnWorkerEvent(WorkerEvent.FAILED)
  onFailed(job: Job) {
    this.testService.testOnFailed(job)
  }
}
