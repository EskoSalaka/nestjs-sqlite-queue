import { Controller, Get } from '@nestjs/common'
import { TestService } from './test.service'
import { SQLiteQueue, InjectQueue } from '../../../src/'

@Controller()
export class QueueController {
  constructor(
    @InjectQueue('test2') private q: SQLiteQueue,
    @InjectQueue('test3') private q2: SQLiteQueue
  ) {}

  @Get()
  getHello(): string {
    this.q2.createJob({ jobData: { SomeData: 'test' } })
    this.q.createJob('test2', { jobData: { SomeData: 'test2' } })
    return 'Hello World!'
  }
}
