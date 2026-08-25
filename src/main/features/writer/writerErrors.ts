import type { WriterErrorCode } from '@shared/ipc/errors/writer'

export class WriterStudioError extends Error {
  constructor(
    readonly code: WriterErrorCode,
    message: string,
    readonly data?: unknown
  ) {
    super(message)
    this.name = 'WriterStudioError'
  }
}

export function isWriterStudioError(error: unknown): error is WriterStudioError {
  return error instanceof WriterStudioError
}
