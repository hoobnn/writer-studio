import { type WorkshopErrorCode, workshopErrorCodes } from '@shared/ipc/errors/workshop'

export { workshopErrorCodes }
export type { WorkshopErrorCode }

export class WorkshopError extends Error {
  constructor(
    readonly code: WorkshopErrorCode,
    message: string,
    readonly details?: Record<string, unknown>
  ) {
    super(message)
    this.name = 'WorkshopError'
  }
}

export function isWorkshopError(error: unknown): error is WorkshopError {
  return error instanceof WorkshopError
}
