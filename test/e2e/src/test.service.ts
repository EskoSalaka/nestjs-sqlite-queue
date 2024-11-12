import { Injectable } from '@nestjs/common'
import { log } from 'console'

@Injectable()
export class TestService {
  async testRun(): Promise<any> {}

  async testRun2(): Promise<any> {}
}
