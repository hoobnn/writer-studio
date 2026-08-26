import { application } from '@application'
import { isWorkshopError } from '@main/features/workshop'
import { IpcError } from '@shared/ipc/errors/IpcError'
import type { workshopRequestSchemas } from '@shared/ipc/schemas/workshop'
import type { IpcHandlersFor } from '@shared/ipc/types'

async function exposeWorkshopError<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation()
  } catch (error) {
    if (isWorkshopError(error)) {
      throw new IpcError(error.code, error.message, error.details)
    }
    throw error
  }
}

export const workshopHandlers: IpcHandlersFor<typeof workshopRequestSchemas> = {
  'workshop.project.create': async (input) =>
    exposeWorkshopError(() => application.get('WorkshopService').createProject(input)),
  'workshop.project.open': async ({ rootPath }) =>
    exposeWorkshopError(() => application.get('WorkshopService').openProject(rootPath)),
  'workshop.entity.list': async (input) =>
    exposeWorkshopError(() => application.get('WorkshopService').listEntities(input)),
  'workshop.entity.read': async (input) =>
    exposeWorkshopError(() => application.get('WorkshopService').readEntity(input)),
  'workshop.chapter.read': async (input) =>
    exposeWorkshopError(() => application.get('WorkshopService').readChapter(input)),
  'workshop.canon.commit': async (input) =>
    exposeWorkshopError(() => application.get('WorkshopService').commitCanon(input)),
  'workshop.canon.rollback': async (input) =>
    exposeWorkshopError(() => application.get('WorkshopService').rollback(input)),
  'workshop.proposal.create': async (input) =>
    exposeWorkshopError(() => application.get('WorkshopService').createProposal(input)),
  'workshop.proposal.list': async (input) =>
    exposeWorkshopError(() => application.get('WorkshopService').listProposals(input)),
  'workshop.proposal.read': async (input) =>
    exposeWorkshopError(() => application.get('WorkshopService').readProposal(input)),
  'workshop.proposal.changes': async (input) =>
    exposeWorkshopError(() => application.get('WorkshopService').readProposalChanges(input)),
  'workshop.proposal.apply': async (input) =>
    exposeWorkshopError(() => application.get('WorkshopService').applyProposal(input)),
  'workshop.proposal.reject': async (input) =>
    exposeWorkshopError(() => application.get('WorkshopService').rejectProposal(input)),
  'workshop.timeline.list': async (input) =>
    exposeWorkshopError(() => application.get('WorkshopService').listTimeline(input))
}
