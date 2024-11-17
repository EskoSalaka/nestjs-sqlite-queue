import { Injectable } from '@nestjs/common'
import type { Job } from 'src/models/job.model'

@Injectable()
export class TestService {
  async testRun(job?: Job): Promise<any> {}
  async testRun2(job?: Job): Promise<any> {}
  async testOnActive(job?: Job): Promise<any> {}
  async testOnDone(job?: Job): Promise<any> {}
  async testOnFailed(job?: Job): Promise<any> {}
}
