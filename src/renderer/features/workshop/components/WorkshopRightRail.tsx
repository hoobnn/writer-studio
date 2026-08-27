import { Badge, Tabs, TabsContent, TabsList, TabsTrigger } from '@cherrystudio/ui'
import { usePersistCache } from '@renderer/data/hooks/useCache'
import { toast } from '@renderer/services/toast'
import type { WorkshopCollection, WorkshopProposal, WorkshopTimelineEntry } from '@shared/types/workshop'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { WorkshopDiscussionPanel } from './WorkshopDiscussionPanel'
import { WorkshopGeneratePanel } from './WorkshopGeneratePanel'
import { WorkshopInvariantPanel } from './WorkshopInvariantPanel'
import { WorkshopProposalPanel } from './WorkshopProposalPanel'
import { WorkshopTimelinePanel } from './WorkshopTimelinePanel'

const HIGHLIGHT_MS = 4_000

interface WorkshopRightRailProps {
  rootPath: string
  headCommit: string
  selectedChapterId?: string
  proposals: WorkshopProposal[]
  timeline: WorkshopTimelineEntry[]
  rollbackBusy: boolean
  refreshAll: () => Promise<void>
  onOpenProposal: (proposalId: string) => void
  onOpenChapter: (chapterId: string) => void
  onOpenEntity: (collection: WorkshopCollection, entityId: string) => void
  locateEntity: (entityId: string) => WorkshopCollection | undefined
  onRollback: (commit: string) => Promise<void>
}

export function WorkshopRightRail({
  rootPath,
  headCommit,
  selectedChapterId,
  proposals,
  timeline,
  rollbackBusy,
  refreshAll,
  onOpenProposal,
  onOpenChapter,
  onOpenEntity,
  locateEntity,
  onRollback
}: WorkshopRightRailProps) {
  const { t } = useTranslation()
  const [tab, setTab] = usePersistCache('ui.workshop.rail_tab')
  const [highlightId, setHighlightId] = useState<string>()
  const highlightTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined)
  useEffect(() => () => clearTimeout(highlightTimerRef.current), [])

  /** 生成完成的反馈闭环:toast + 切到提案 tab + 新提案短暂高亮。 */
  const handleProposalArrived = useCallback(
    async (proposalId?: string) => {
      await refreshAll()
      toast.success(t('workshop.generate.done_toast'))
      setTab('proposals')
      if (proposalId) {
        setHighlightId(proposalId)
        clearTimeout(highlightTimerRef.current)
        highlightTimerRef.current = setTimeout(() => setHighlightId(undefined), HIGHLIGHT_MS)
      }
    },
    [refreshAll, setTab, t]
  )

  const pendingCount = proposals.filter((proposal) => proposal.status === 'pending').length

  return (
    <Tabs
      value={tab}
      onValueChange={(value) => setTab(value as typeof tab)}
      variant="line"
      className="flex min-h-0 flex-1 flex-col">
      <TabsList aria-label={t('workshop.title')} className="w-full justify-start border-border border-b-[0.5px] px-2">
        <TabsTrigger value="discussion">{t('workshop.discussion.title')}</TabsTrigger>
        <TabsTrigger value="proposals">
          {t('workshop.proposals.title')}
          {pendingCount > 0 ? <Badge className="ml-1.5">{pendingCount}</Badge> : null}
        </TabsTrigger>
        <TabsTrigger value="invariants">{t('workshop.invariants.title')}</TabsTrigger>
        <TabsTrigger value="timeline">{t('workshop.timeline.title')}</TabsTrigger>
      </TabsList>
      <TabsContent value="discussion" className="flex min-h-0 flex-1 flex-col">
        <WorkshopDiscussionPanel rootPath={rootPath} onTurnFinished={refreshAll} onOpenProposal={onOpenProposal} />
      </TabsContent>
      <TabsContent value="proposals" className="flex min-h-0 flex-1 flex-col">
        <WorkshopGeneratePanel
          rootPath={rootPath}
          selectedChapterId={selectedChapterId}
          onProposalArrived={handleProposalArrived}
        />
        <WorkshopProposalPanel proposals={proposals} highlightId={highlightId} onOpen={onOpenProposal} />
      </TabsContent>
      <TabsContent value="invariants" className="flex min-h-0 flex-1 flex-col">
        <WorkshopInvariantPanel
          key={rootPath}
          rootPath={rootPath}
          headCommit={headCommit}
          locateEntity={locateEntity}
          onOpenChapter={onOpenChapter}
          onOpenEntity={onOpenEntity}
        />
      </TabsContent>
      <TabsContent value="timeline" className="flex min-h-0 flex-1 flex-col">
        <WorkshopTimelinePanel headCommit={headCommit} entries={timeline} busy={rollbackBusy} onRollback={onRollback} />
      </TabsContent>
    </Tabs>
  )
}
