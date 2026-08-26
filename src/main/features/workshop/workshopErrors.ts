export const workshopErrorCodes = {
  PROJECT_EXISTS: 'workshop.project_exists',
  NOT_A_PROJECT: 'workshop.not_a_project',
  INVALID_CHANGESET: 'workshop.invalid_changeset',
  CHAPTER_NOT_FOUND: 'workshop.chapter_not_found',
  ENTITY_NOT_FOUND: 'workshop.entity_not_found',
  PROPOSAL_NOT_FOUND: 'workshop.proposal_not_found',
  PROPOSAL_NOT_PENDING: 'workshop.proposal_not_pending',
  PROPOSAL_STALE: 'workshop.proposal_stale',
  ROLLBACK_TARGET_INVALID: 'workshop.rollback_target_invalid'
} as const

export type WorkshopErrorCode = (typeof workshopErrorCodes)[keyof typeof workshopErrorCodes]

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
