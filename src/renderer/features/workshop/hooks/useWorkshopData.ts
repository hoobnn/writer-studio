import { ipcApi } from '@renderer/ipc'
import { toast } from '@renderer/services/toast'
import { getErrorMessage } from '@renderer/utils/error'
import type {
  WorkshopCollection,
  WorkshopEntity,
  WorkshopProposal,
  WorkshopTimelineEntry
} from '@shared/types/workshop'
import { WORKSHOP_COLLECTIONS } from '@shared/types/workshop'
import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

export type WorkshopEntityIndex = Partial<Record<WorkshopCollection, WorkshopEntity[]>>

export interface WorkshopDataApi {
  entities: WorkshopEntityIndex
  proposals: WorkshopProposal[]
  timeline: WorkshopTimelineEntry[]
  /** 重拉实体/提案/时间线。依赖仅 rootPath,可安全作为子组件回调依赖。 */
  refreshSideData: () => Promise<void>
}

export function useWorkshopData(rootPath: string): WorkshopDataApi {
  const { t } = useTranslation()
  const [entities, setEntities] = useState<WorkshopEntityIndex>({})
  const [proposals, setProposals] = useState<WorkshopProposal[]>([])
  const [timeline, setTimeline] = useState<WorkshopTimelineEntry[]>([])

  const refreshSideData = useCallback(async () => {
    const [entityResults, proposalResult, timelineResult] = await Promise.all([
      Promise.all(
        WORKSHOP_COLLECTIONS.map(
          async (collection) =>
            [collection, (await ipcApi.request('workshop.entity.list', { rootPath, collection })).entities] as const
        )
      ),
      ipcApi.request('workshop.proposal.list', { rootPath }),
      ipcApi.request('workshop.timeline.list', { rootPath, limit: 100 })
    ])
    setEntities(Object.fromEntries(entityResults))
    setProposals(proposalResult.proposals)
    setTimeline(timelineResult.entries)
  }, [rootPath])

  useEffect(() => {
    refreshSideData().catch((error) =>
      toast.error({ title: t('workshop.errors.load'), description: getErrorMessage(error) })
    )
  }, [refreshSideData, t])

  return { entities, proposals, timeline, refreshSideData }
}
