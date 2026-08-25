import {
  WriterChapterCreateInputSchema,
  WriterChapterDocumentSchema,
  WriterChapterReadInputSchema,
  WriterChapterSaveInputSchema,
  WriterContinuityCoverageUpdateInputSchema,
  WriterContinuityReviewReadInputSchema,
  WriterContinuityReviewRunInputSchema,
  WriterContinuityReviewViewSchema,
  WriterContinuitySaveInputSchema,
  WriterContinuityUnwaiveInputSchema,
  WriterContinuityWaiveInputSchema,
  WriterGenerationCancelInputSchema,
  WriterGenerationCancelResultSchema,
  WriterGenerationStartInputSchema,
  WriterGenerationStartResultSchema,
  WriterHistoryListInputSchema,
  WriterHistoryListResultSchema,
  WriterHistoryReadInputSchema,
  WriterHistoryRestoreInputSchema,
  WriterHistorySnapshotSchema,
  WriterOutlineSaveInputSchema,
  WriterProjectCreateInputSchema,
  WriterProjectOpenInputSchema,
  WriterProjectSchema,
  WriterProposalApplyInputSchema,
  WriterProposalListInputSchema,
  WriterProposalListResultSchema,
  WriterProposalReadInputSchema,
  WriterProposalSchema,
  WriterStoryBibleSaveInputSchema
} from '@shared/types/writer'

import { defineRoute } from '../define'

export const writerRequestSchemas = {
  'writer.project.create': defineRoute({
    input: WriterProjectCreateInputSchema,
    output: WriterProjectSchema
  }),
  'writer.project.open': defineRoute({
    input: WriterProjectOpenInputSchema,
    output: WriterProjectSchema
  }),
  'writer.chapter.create': defineRoute({
    input: WriterChapterCreateInputSchema,
    output: WriterChapterDocumentSchema
  }),
  'writer.chapter.read': defineRoute({
    input: WriterChapterReadInputSchema,
    output: WriterChapterDocumentSchema
  }),
  'writer.chapter.save': defineRoute({
    input: WriterChapterSaveInputSchema,
    output: WriterChapterDocumentSchema
  }),
  'writer.story_bible.save': defineRoute({
    input: WriterStoryBibleSaveInputSchema,
    output: WriterProjectSchema
  }),
  'writer.outline.save': defineRoute({
    input: WriterOutlineSaveInputSchema,
    output: WriterProjectSchema
  }),
  'writer.continuity.save': defineRoute({
    input: WriterContinuitySaveInputSchema,
    output: WriterProjectSchema
  }),
  'writer.continuity_review.read': defineRoute({
    input: WriterContinuityReviewReadInputSchema,
    output: WriterContinuityReviewViewSchema
  }),
  'writer.continuity_review.run': defineRoute({
    input: WriterContinuityReviewRunInputSchema,
    output: WriterContinuityReviewViewSchema
  }),
  'writer.continuity_review.waive': defineRoute({
    input: WriterContinuityWaiveInputSchema,
    output: WriterContinuityReviewViewSchema
  }),
  'writer.continuity_review.unwaive': defineRoute({
    input: WriterContinuityUnwaiveInputSchema,
    output: WriterContinuityReviewViewSchema
  }),
  'writer.continuity_review.coverage.update': defineRoute({
    input: WriterContinuityCoverageUpdateInputSchema,
    output: WriterContinuityReviewViewSchema
  }),
  'writer.generation.start': defineRoute({
    input: WriterGenerationStartInputSchema,
    output: WriterGenerationStartResultSchema
  }),
  'writer.generation.cancel': defineRoute({
    input: WriterGenerationCancelInputSchema,
    output: WriterGenerationCancelResultSchema
  }),
  'writer.proposal.apply': defineRoute({
    input: WriterProposalApplyInputSchema,
    output: WriterChapterDocumentSchema
  }),
  'writer.proposal.list': defineRoute({
    input: WriterProposalListInputSchema,
    output: WriterProposalListResultSchema
  }),
  'writer.proposal.read': defineRoute({
    input: WriterProposalReadInputSchema,
    output: WriterProposalSchema
  }),
  'writer.history.list': defineRoute({
    input: WriterHistoryListInputSchema,
    output: WriterHistoryListResultSchema
  }),
  'writer.history.read': defineRoute({
    input: WriterHistoryReadInputSchema,
    output: WriterHistorySnapshotSchema
  }),
  'writer.history.restore': defineRoute({
    input: WriterHistoryRestoreInputSchema,
    output: WriterChapterDocumentSchema
  })
}
