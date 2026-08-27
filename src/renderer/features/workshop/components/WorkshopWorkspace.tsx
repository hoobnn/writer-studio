import {
  ConfirmDialog,
  EmptyState,
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
  useResizablePanelRef
} from '@cherrystudio/ui'
import { usePersistCache } from '@renderer/data/hooks/useCache'
import { useCommandContextKey } from '@renderer/hooks/command'
import { ipcApi } from '@renderer/ipc'
import { toast } from '@renderer/services/toast'
import type { JobSnapshot } from '@shared/data/api/schemas/jobs'
import type { WorkshopCollection, WorkshopProjectSnapshot } from '@shared/types/workshop'
import { WORKSHOP_COLLECTIONS } from '@shared/types/workshop'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { useWorkshopBusy } from '../hooks/useWorkshopBusy'
import { useWorkshopData } from '../hooks/useWorkshopData'
import { useWorkshopJob } from '../hooks/useWorkshopJob'
import { useWorkshopView } from '../hooks/useWorkshopView'
import { entityLabel } from '../workshopEntityPresenter'
import type { WorkshopReferenceOptions } from './entityForms/types'
import { WorkshopChapterEditor } from './WorkshopChapterEditor'
import { WorkshopEntityEditor } from './WorkshopEntityEditor'
import type { WorkshopExportFormat } from './WorkshopHeader'
import { WorkshopHeader } from './WorkshopHeader'
import { WorkshopNav } from './WorkshopNav'
import { WorkshopProposalReview } from './WorkshopProposalReview'
import { WorkshopRightRail } from './WorkshopRightRail'
import { WorkshopSettingsDialog } from './WorkshopSettingsDialog'
import { volumeRunTotal, WorkshopVolumeRunView } from './WorkshopVolumeRunView'

interface WorkshopWorkspaceProps {
  snapshot: WorkshopProjectSnapshot
  onRefreshSnapshot: () => Promise<void>
  onClose: () => void
}

function nextChapterId(chapterIds: string[]): string {
  const numbers = chapterIds
    .map((id) => /^ch-(\d+)$/.exec(id)?.[1])
    .filter((value): value is string => Boolean(value))
    .map(Number)
  const next = numbers.length > 0 ? Math.max(...numbers) + 1 : 1
  return `ch-${String(next).padStart(4, '0')}`
}

export function WorkshopWorkspace({ snapshot, onRefreshSnapshot, onClose }: WorkshopWorkspaceProps) {
  const { t } = useTranslation()
  const { rootPath } = snapshot
  const { entities, proposals, timeline, refreshSideData } = useWorkshopData(rootPath)
  const { busy, run } = useWorkshopBusy()
  const viewApi = useWorkshopView()
  const { view } = viewApi
  const [settingsOpen, setSettingsOpen] = useState(false)

  const refreshAll = useCallback(async () => {
    await Promise.all([onRefreshSnapshot(), refreshSideData()])
  }, [onRefreshSnapshot, refreshSideData])

  useCommandContextKey(
    'workshop.editor_active',
    view.kind === 'chapter' || view.kind === 'entity' || view.kind === 'entityCreate'
  )

  // ---- 面板可见性与布局持久化 ----
  const [panelLayout, setPanelLayout] = usePersistCache('ui.workshop.panel_layout')
  const initialLayoutRef = useRef(panelLayout)
  const initialLayout = initialLayoutRef.current
  const persistLayoutTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined)
  useEffect(() => () => clearTimeout(persistLayoutTimerRef.current), [])
  const handleLayoutChanged = useCallback(
    (layout: Record<string, number>) => {
      // 拖拽期间每帧回调,防抖后落盘。
      clearTimeout(persistLayoutTimerRef.current)
      persistLayoutTimerRef.current = setTimeout(() => setPanelLayout(layout), 300)
    },
    [setPanelLayout]
  )
  const [navVisible, setNavVisible] = useState(initialLayout?.nav !== 0)
  const [railVisible, setRailVisible] = useState(initialLayout?.rail !== 0)
  const [focusMode, setFocusMode] = useState(false)
  const navPanelRef = useResizablePanelRef()
  const railPanelRef = useResizablePanelRef()
  const layoutBeforeFocusRef = useRef({ navVisible: true, railVisible: true })

  const setNavPanelVisible = useCallback(
    (visible: boolean) => {
      if (visible) navPanelRef.current?.expand()
      else navPanelRef.current?.collapse()
      setNavVisible(visible)
    },
    [navPanelRef]
  )
  const setRailPanelVisible = useCallback(
    (visible: boolean) => {
      if (visible) railPanelRef.current?.expand()
      else railPanelRef.current?.collapse()
      setRailVisible(visible)
    },
    [railPanelRef]
  )
  const toggleFocusMode = useCallback(() => {
    setFocusMode((current) => {
      if (current) {
        setNavPanelVisible(layoutBeforeFocusRef.current.navVisible)
        setRailPanelVisible(layoutBeforeFocusRef.current.railVisible)
      } else {
        layoutBeforeFocusRef.current = { navVisible, railVisible }
        setNavPanelVisible(false)
        setRailPanelVisible(false)
      }
      return !current
    })
  }, [navVisible, railVisible, setNavPanelVisible, setRailPanelVisible])

  // ---- 整卷 job:工作区持有,视图卸载后 header chip 仍可观察 ----
  const [volumeResult, setVolumeResult] = useState<JobSnapshot>()
  const volumeJob = useWorkshopJob({
    rootPath,
    domain: 'volume',
    onCompleted: async (jobSnapshot) => {
      setVolumeResult(jobSnapshot)
      await refreshAll()
    },
    onFailed: (jobSnapshot) => setVolumeResult(jobSnapshot)
  })

  const chapterPlans = useMemo(() => entities['outline/chapters'] ?? [], [entities])
  const chapterTitle = useCallback(
    (chapterId: string): string | undefined => {
      const data = chapterPlans.find((plan) => plan.id === chapterId)?.data as { title?: unknown } | undefined
      return typeof data?.title === 'string' && data.title.trim() ? data.title : undefined
    },
    [chapterPlans]
  )

  const locateEntity = useCallback(
    (entityId: string): WorkshopCollection | undefined =>
      WORKSHOP_COLLECTIONS.find((collection) => entities[collection]?.some((entity) => entity.id === entityId)),
    [entities]
  )

  const referenceOptions = useMemo<WorkshopReferenceOptions>(() => {
    const chapterIds = new Set(snapshot.chapterIds)
    for (const plan of chapterPlans) chapterIds.add(plan.id)
    const chapters = [...chapterIds].map((id) => {
      const data = chapterPlans.find((plan) => plan.id === id)?.data as { title?: unknown } | undefined
      const title = typeof data?.title === 'string' && data.title.trim() ? data.title : undefined
      return { value: id, label: title ? `${title} · ${id}` : id }
    })
    const characters = (entities['codex/characters'] ?? []).map((entity) => ({
      value: entity.id,
      label: entityLabel('codex/characters', entity)
    }))
    const requirementsForChapter = (chapterId: string) => {
      const data = chapterPlans.find((plan) => plan.id === chapterId)?.data as
        | { requirements?: { id: string; description: string }[] }
        | undefined
      return (data?.requirements ?? []).map((requirement) => ({
        value: requirement.id,
        label: `${requirement.id} · ${requirement.description}`
      }))
    }
    return { chapters, characters, requirementsForChapter }
  }, [chapterPlans, entities, snapshot.chapterIds])

  const summaryChapterOptions = useMemo(() => {
    const withSummary = new Set((entities['ledger/summaries'] ?? []).map((entity) => entity.id))
    return referenceOptions.chapters.filter((option) => !withSummary.has(option.value))
  }, [entities, referenceOptions.chapters])

  const createChapter = useCallback(() => {
    const chapterId = nextChapterId(snapshot.chapterIds)
    void run('create', 'workshop.errors.create_chapter', async () => {
      await ipcApi.request('workshop.canon.commit', {
        rootPath,
        title: t('workshop.commit.create_chapter', { id: chapterId }),
        changes: [{ op: 'write_chapter', chapterId, content: '' }]
      })
      await refreshAll()
      viewApi.forceView({ kind: 'chapter', chapterId })
    })
  }, [refreshAll, rootPath, run, snapshot.chapterIds, t, viewApi])

  const exportProject = useCallback(
    (format: WorkshopExportFormat) => {
      void run('export', 'workshop.export.failed_prefix', async () => {
        const { filePath } = await ipcApi.request('workshop.export', { rootPath, format })
        toast.success({
          title: t('workshop.export.success'),
          description: filePath ? t('workshop.export.saved_to', { path: filePath }) : undefined
        })
      })
    },
    [rootPath, run, t]
  )

  // 回滚不再经过脏守卫:未保存草稿由章节编辑器的对账冲突条保护,不会被静默覆盖。
  const rollback = useCallback(
    async (commit: string) => {
      const ok = await run('rollback', 'workshop.errors.rollback', async () => {
        await ipcApi.request('workshop.canon.rollback', { rootPath, commit })
        await refreshAll()
      })
      if (ok) toast.success(t('workshop.timeline.rollback_done'))
    },
    [refreshAll, rootPath, run, t]
  )

  const volumeDetail = volumeJob.progress.detail as { completed?: number } | undefined
  const volumeTotal = volumeRunTotal(volumeJob.snapshot, entities['outline/volumes'] ?? [])
  const volumeRunningLabel = volumeJob.running
    ? volumeTotal
      ? t('workshop.jobs.running_volume', {
          current: Math.min((volumeDetail?.completed ?? 0) + 1, volumeTotal),
          total: volumeTotal
        })
      : t('workshop.volume.running')
    : undefined

  const renderMainView = () => {
    switch (view.kind) {
      case 'chapter':
        return (
          <WorkshopChapterEditor
            key={`${rootPath}:${view.chapterId}`}
            rootPath={rootPath}
            chapterId={view.chapterId}
            title={chapterTitle(view.chapterId)}
            headCommit={snapshot.head}
            busy={busy}
            run={run}
            registerDirtyCheck={viewApi.registerDirtyCheck}
            onSaved={refreshAll}
            onMissing={() => viewApi.forceView({ kind: 'empty' })}
          />
        )
      case 'entity': {
        const entity = entities[view.collection]?.find((candidate) => candidate.id === view.id)
        if (!entity) return <EmptyState illustration="book" title={t('workshop.workspace.select_prompt')} />
        return (
          <WorkshopEntityEditor
            key={`${view.collection}:${view.id}`}
            rootPath={rootPath}
            collection={view.collection}
            entity={entity}
            busy={busy}
            run={run}
            refs={referenceOptions}
            existingIds={(entities[view.collection] ?? []).map((candidate) => candidate.id)}
            registerDirtyCheck={viewApi.registerDirtyCheck}
            onOpenVolumeRun={viewApi.openVolumeRun}
            onCreated={() => {}}
            onDeleted={() => viewApi.forceView({ kind: 'empty' })}
            onMutated={refreshAll}
          />
        )
      }
      case 'entityCreate':
        return (
          <WorkshopEntityEditor
            key={`create:${view.collection}`}
            rootPath={rootPath}
            collection={view.collection}
            busy={busy}
            run={run}
            refs={referenceOptions}
            existingIds={(entities[view.collection] ?? []).map((candidate) => candidate.id)}
            summaryChapterOptions={view.collection === 'ledger/summaries' ? summaryChapterOptions : undefined}
            registerDirtyCheck={viewApi.registerDirtyCheck}
            onOpenVolumeRun={viewApi.openVolumeRun}
            onCreated={(id) => viewApi.forceView({ kind: 'entity', collection: view.collection, id })}
            onDeleted={() => viewApi.forceView({ kind: 'empty' })}
            onMutated={refreshAll}
          />
        )
      case 'proposal':
        return (
          <WorkshopProposalReview
            key={view.proposalId}
            rootPath={rootPath}
            proposalId={view.proposalId}
            proposal={proposals.find((candidate) => candidate.id === view.proposalId)}
            busy={busy}
            run={run}
            onClose={viewApi.closeView}
            onOpenChapter={viewApi.openChapter}
            onMutated={refreshAll}
          />
        )
      case 'volumeRun':
        return (
          <WorkshopVolumeRunView
            key={view.volumeId ?? 'any'}
            rootPath={rootPath}
            volumes={entities['outline/volumes'] ?? []}
            initialVolumeId={view.volumeId}
            chapterTitle={chapterTitle}
            job={volumeJob}
            lastResult={volumeResult}
            onClearResult={() => setVolumeResult(undefined)}
            onClose={viewApi.closeView}
            onOpenChapter={viewApi.openChapter}
            onOpenProposal={viewApi.openProposal}
          />
        )
      default:
        return <EmptyState illustration="book" title={t('workshop.workspace.select_prompt')} />
    }
  }

  return (
    <main data-ui="workshop.workspace" className="flex h-full min-h-0 flex-col overflow-hidden bg-background">
      <WorkshopHeader
        title={snapshot.card.title}
        navVisible={navVisible}
        railVisible={railVisible}
        focusMode={focusMode}
        onToggleNav={() => setNavPanelVisible(!navVisible)}
        onToggleRail={() => setRailPanelVisible(!railVisible)}
        onToggleFocus={toggleFocusMode}
        volumeRunningLabel={volumeRunningLabel}
        onOpenVolumeRun={() => viewApi.openVolumeRun()}
        exportBusy={Boolean(busy.export)}
        onExport={exportProject}
        onOpenSettings={() => setSettingsOpen(true)}
        onClose={() => viewApi.guardDirty(onClose)}
      />
      <div className="min-h-0 min-w-0 flex-1 overflow-hidden">
        <ResizablePanelGroup
          direction="horizontal"
          className="h-full min-h-0 min-w-0"
          onLayoutChanged={handleLayoutChanged}>
          <ResizablePanel
            id="nav"
            defaultSize={initialLayout?.nav ? initialLayout.nav : 20}
            minSize={14}
            collapsedSize={0}
            collapsible
            panelRef={navPanelRef}>
            <aside
              data-ui="workshop.nav"
              aria-hidden={!navVisible}
              inert={!navVisible}
              aria-label={t('workshop.title')}
              className="flex h-full min-h-0 flex-col border-border border-r-[0.5px] bg-sidebar">
              <WorkshopNav
                chapterIds={snapshot.chapterIds}
                chapterTitle={chapterTitle}
                entities={entities}
                view={view}
                createBusy={Boolean(busy.create)}
                onOpenChapter={viewApi.openChapter}
                onOpenEntity={viewApi.openEntity}
                onCreateChapter={() => viewApi.guardDirty(createChapter)}
                onCreateEntity={viewApi.openEntityCreate}
                onOpenVolumeRun={viewApi.openVolumeRun}
              />
            </aside>
          </ResizablePanel>
          {navVisible ? <ResizableHandle withHandle /> : null}

          <ResizablePanel id="main" defaultSize={initialLayout?.main ?? 52} minSize={36}>
            <section data-ui="workshop.main" className="h-full min-h-0 min-w-0">
              {renderMainView()}
            </section>
          </ResizablePanel>

          {railVisible ? <ResizableHandle withHandle /> : null}
          <ResizablePanel
            id="rail"
            defaultSize={initialLayout?.rail ? initialLayout.rail : 28}
            minSize={22}
            collapsedSize={0}
            collapsible
            panelRef={railPanelRef}>
            <aside
              data-ui="workshop.rail"
              aria-hidden={!railVisible}
              inert={!railVisible}
              className="flex h-full min-h-0 flex-col border-border border-l-[0.5px]">
              <WorkshopRightRail
                rootPath={rootPath}
                headCommit={snapshot.head}
                selectedChapterId={view.kind === 'chapter' ? view.chapterId : undefined}
                proposals={proposals}
                timeline={timeline}
                rollbackBusy={Boolean(busy.rollback)}
                refreshAll={refreshAll}
                onOpenProposal={viewApi.openProposal}
                onOpenChapter={viewApi.openChapter}
                onOpenEntity={viewApi.openEntity}
                locateEntity={locateEntity}
                onRollback={rollback}
              />
            </aside>
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>

      <WorkshopSettingsDialog
        rootPath={rootPath}
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        onCommitted={() => void refreshAll()}
      />
      <ConfirmDialog
        open={viewApi.pendingDiscard}
        onOpenChange={(open) => {
          if (!open) viewApi.resolveDiscard(false)
        }}
        title={t('workshop.editor.unsaved_title')}
        description={t('workshop.editor.unsaved_description')}
        confirmText={t('workshop.editor.discard')}
        cancelText={t('common.cancel')}
        destructive
        onConfirm={() => viewApi.resolveDiscard(true)}
      />
    </main>
  )
}
