import { Injectable } from '@nestjs/common'
import { log } from 'console'

@Injectable()
export class TestService {
  async testRun(): Promise<any> {}
}
