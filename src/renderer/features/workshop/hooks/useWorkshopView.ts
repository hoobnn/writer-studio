import type { WorkshopCollection } from '@shared/types/workshop'
import { useCallback, useRef, useState } from 'react'

/** 中栏视图路由:selection 的升级形态,proposal/volumeRun 是带返回锚点的叠加视图。 */
export type WorkshopView =
  | { kind: 'empty' }
  | { kind: 'chapter'; chapterId: string }
  | { kind: 'entity'; collection: WorkshopCollection; id: string }
  | { kind: 'entityCreate'; collection: WorkshopCollection }
  | { kind: 'proposal'; proposalId: string }
  | { kind: 'volumeRun'; volumeId?: string }

export interface WorkshopViewApi {
  view: WorkshopView
  openChapter: (chapterId: string) => void
  openEntity: (collection: WorkshopCollection, id: string) => void
  openEntityCreate: (collection: WorkshopCollection) => void
  openProposal: (proposalId: string) => void
  openVolumeRun: (volumeId?: string) => void
  /** 关闭叠加视图回到来路;非叠加视图回到空态。 */
  closeView: () => void
  /** 不经脏守卫直接切换,仅限已通过守卫的流程内部使用(如新建章节后跳转、章节消失回空态)。 */
  forceView: (next: WorkshopView) => void
  /** 任一已注册编辑器为脏时先弹确认,否则直接执行。所有导航都应经过它。 */
  guardDirty: (run: () => void) => void
  /** 编辑器注册自己的脏检查;返回注销函数(卸载时调用)。 */
  registerDirtyCheck: (check: () => boolean) => () => void
  pendingDiscard: boolean
  resolveDiscard: (confirmed: boolean) => void
}

const OVERLAY_KINDS: ReadonlySet<WorkshopView['kind']> = new Set(['proposal', 'volumeRun'])

export function useWorkshopView(): WorkshopViewApi {
  const [view, setView] = useState<WorkshopView>({ kind: 'empty' })
  const returnViewRef = useRef<WorkshopView>({ kind: 'empty' })
  const dirtyChecksRef = useRef(new Set<() => boolean>())
  const [pendingRun, setPendingRun] = useState<{ run: () => void }>()

  const registerDirtyCheck = useCallback((check: () => boolean) => {
    dirtyChecksRef.current.add(check)
    return () => {
      dirtyChecksRef.current.delete(check)
    }
  }, [])

  const guardDirty = useCallback((run: () => void) => {
    let dirty = false
    for (const check of dirtyChecksRef.current) {
      if (check()) {
        dirty = true
        break
      }
    }
    if (dirty) setPendingRun({ run })
    else run()
  }, [])

  const resolveDiscard = useCallback((confirmed: boolean) => {
    setPendingRun((pending) => {
      if (confirmed) pending?.run()
      return undefined
    })
  }, [])

  const forceView = useCallback((next: WorkshopView) => {
    setView((current) => {
      if (OVERLAY_KINDS.has(next.kind) && !OVERLAY_KINDS.has(current.kind)) {
        returnViewRef.current = current
      }
      return next
    })
  }, [])

  const navigate = useCallback((next: WorkshopView) => guardDirty(() => forceView(next)), [forceView, guardDirty])

  const openChapter = useCallback((chapterId: string) => navigate({ kind: 'chapter', chapterId }), [navigate])
  const openEntity = useCallback(
    (collection: WorkshopCollection, id: string) => navigate({ kind: 'entity', collection, id }),
    [navigate]
  )
  const openEntityCreate = useCallback(
    (collection: WorkshopCollection) => navigate({ kind: 'entityCreate', collection }),
    [navigate]
  )
  const openProposal = useCallback((proposalId: string) => navigate({ kind: 'proposal', proposalId }), [navigate])
  const openVolumeRun = useCallback((volumeId?: string) => navigate({ kind: 'volumeRun', volumeId }), [navigate])

  const closeView = useCallback(() => {
    guardDirty(() => {
      setView((current) => (OVERLAY_KINDS.has(current.kind) ? returnViewRef.current : { kind: 'empty' }))
    })
  }, [guardDirty])

  return {
    view,
    openChapter,
    openEntity,
    openEntityCreate,
    openProposal,
    openVolumeRun,
    closeView,
    forceView,
    guardDirty,
    registerDirtyCheck,
    pendingDiscard: Boolean(pendingRun),
    resolveDiscard
  }
}
