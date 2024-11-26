import { Controller, Get } from '@nestjs/common'
import { SQLiteQueue, InjectQueue } from '../../../src/'

@Controller()
export class TestController {
  constructor(
    @InjectQueue() private defaultQueue: SQLiteQueue,
    @InjectQueue('NAMED_JOBS_TEST_QUEUE') private namedQueue: SQLiteQueue
  ) {}

  @Get()
  getHello(): string {
    this.defaultQueue.createJob({ jobData: { SomeData: 'test2' } })
    this.namedQueue.createJob({ jobData: { SomeData: 'test' } })

    return 'Hello World!'
  }
}
