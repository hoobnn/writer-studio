import {
  WorkshopCanonCommitInputSchema,
  WorkshopChapterReadInputSchema,
  WorkshopChapterReadResultSchema,
  WorkshopEntityListInputSchema,
  WorkshopEntityListResultSchema,
  WorkshopEntityReadInputSchema,
  WorkshopEntitySchema,
  WorkshopGenerationCancelResultSchema,
  WorkshopGenerationJobInputSchema,
  WorkshopGenerationStartInputSchema,
  WorkshopGenerationStartResultSchema,
  WorkshopGenerationStatusResultSchema,
  WorkshopProjectCreateInputSchema,
  WorkshopProjectOpenInputSchema,
  WorkshopProjectSnapshotSchema,
  WorkshopProposalChangesResultSchema,
  WorkshopProposalCreateInputSchema,
  WorkshopProposalListInputSchema,
  WorkshopProposalListResultSchema,
  WorkshopProposalReadInputSchema,
  WorkshopProposalSchema,
  WorkshopRollbackInputSchema,
  WorkshopTimelineEntrySchema,
  WorkshopTimelineListInputSchema,
  WorkshopTimelineListResultSchema
} from '@shared/types/workshop'

import { defineRoute } from '../define'

export const workshopRequestSchemas = {
  'workshop.project.create': defineRoute({
    input: WorkshopProjectCreateInputSchema,
    output: WorkshopProjectSnapshotSchema
  }),
  'workshop.project.open': defineRoute({
    input: WorkshopProjectOpenInputSchema,
    output: WorkshopProjectSnapshotSchema
  }),
  'workshop.entity.list': defineRoute({
    input: WorkshopEntityListInputSchema,
    output: WorkshopEntityListResultSchema
  }),
  'workshop.entity.read': defineRoute({
    input: WorkshopEntityReadInputSchema,
    output: WorkshopEntitySchema
  }),
  'workshop.chapter.read': defineRoute({
    input: WorkshopChapterReadInputSchema,
    output: WorkshopChapterReadResultSchema
  }),
  'workshop.canon.commit': defineRoute({
    input: WorkshopCanonCommitInputSchema,
    output: WorkshopTimelineEntrySchema
  }),
  'workshop.canon.rollback': defineRoute({
    input: WorkshopRollbackInputSchema,
    output: WorkshopTimelineEntrySchema
  }),
  'workshop.proposal.create': defineRoute({
    input: WorkshopProposalCreateInputSchema,
    output: WorkshopProposalSchema
  }),
  'workshop.proposal.list': defineRoute({
    input: WorkshopProposalListInputSchema,
    output: WorkshopProposalListResultSchema
  }),
  'workshop.proposal.read': defineRoute({
    input: WorkshopProposalReadInputSchema,
    output: WorkshopProposalSchema
  }),
  'workshop.proposal.changes': defineRoute({
    input: WorkshopProposalReadInputSchema,
    output: WorkshopProposalChangesResultSchema
  }),
  'workshop.proposal.apply': defineRoute({
    input: WorkshopProposalReadInputSchema,
    output: WorkshopTimelineEntrySchema
  }),
  'workshop.proposal.reject': defineRoute({
    input: WorkshopProposalReadInputSchema,
    output: WorkshopProposalSchema
  }),
  'workshop.timeline.list': defineRoute({
    input: WorkshopTimelineListInputSchema,
    output: WorkshopTimelineListResultSchema
  }),
  'workshop.generation.start': defineRoute({
    input: WorkshopGenerationStartInputSchema,
    output: WorkshopGenerationStartResultSchema
  }),
  'workshop.generation.status': defineRoute({
    input: WorkshopGenerationJobInputSchema,
    output: WorkshopGenerationStatusResultSchema
  }),
  'workshop.generation.cancel': defineRoute({
    input: WorkshopGenerationJobInputSchema,
    output: WorkshopGenerationCancelResultSchema
  })
}
