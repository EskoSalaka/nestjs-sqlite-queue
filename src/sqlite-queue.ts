export class JobNotFoundError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'JobNotFoundError'
  }
}
