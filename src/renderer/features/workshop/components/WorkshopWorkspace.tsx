import { Badge, Button, Tabs, TabsContent, TabsList, TabsTrigger, Textarea } from '@cherrystudio/ui'
import { ipcApi } from '@renderer/ipc'
import { formatErrorMessageWithPrefix } from '@renderer/utils/error'
import type {
  WorkshopCollection,
  WorkshopEntity,
  WorkshopProjectSnapshot,
  WorkshopProposal,
  WorkshopTimelineEntry
} from '@shared/types/workshop'
import { WORKSHOP_COLLECTIONS } from '@shared/types/workshop'
import { FileText, X } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { WorkshopDiscussionPanel } from './WorkshopDiscussionPanel'
import { WorkshopGeneratePanel } from './WorkshopGeneratePanel'
import { WorkshopInvariantPanel } from './WorkshopInvariantPanel'
import { WorkshopProposalPanel } from './WorkshopProposalPanel'
import { WorkshopTimelinePanel } from './WorkshopTimelinePanel'

interface WorkshopWorkspaceProps {
  snapshot: WorkshopProjectSnapshot
  onRefreshSnapshot: () => Promise<void>
  onClose: () => void
}

type Selection = { type: 'chapter'; id: string } | { type: 'entity'; collection: WorkshopCollection; id: string }

type EntityIndex = Partial<Record<WorkshopCollection, WorkshopEntity[]>>

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
  const [entities, setEntities] = useState<EntityIndex>({})
  const [proposals, setProposals] = useState<WorkshopProposal[]>([])
  const [timeline, setTimeline] = useState<WorkshopTimelineEntry[]>([])
  const [selection, setSelection] = useState<Selection>()
  const [chapterContent, setChapterContent] = useState('')
  const [chapterBaseline, setChapterBaseline] = useState('')
  const [busy, setBusy] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')

  const loadSideData = useCallback(async () => {
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
    loadSideData().catch((error) => setErrorMessage(formatErrorMessageWithPrefix(error, t('workshop.errors.load'))))
  }, [loadSideData, t])

  const refreshAll = useCallback(async () => {
    await Promise.all([onRefreshSnapshot(), loadSideData()])
    if (selection?.type !== 'chapter') return
    try {
      const { content } = await ipcApi.request('workshop.chapter.read', { rootPath, chapterId: selection.id })
      setChapterContent(content)
      setChapterBaseline(content)
    } catch {
      // 回滚可能删除了当前章节;回到未选中状态。
      setSelection(undefined)
    }
  }, [loadSideData, onRefreshSnapshot, rootPath, selection])

  const runAction = useCallback(
    async (errorKey: string, action: () => Promise<void>) => {
      setBusy(true)
      setErrorMessage('')
      try {
        await action()
      } catch (error) {
        setErrorMessage(formatErrorMessageWithPrefix(error, t(errorKey)))
      } finally {
        setBusy(false)
      }
    },
    [t]
  )

  const openChapter = useCallback(
    (chapterId: string) => {
      void runAction('workshop.errors.load', async () => {
        const { content } = await ipcApi.request('workshop.chapter.read', { rootPath, chapterId })
        setSelection({ type: 'chapter', id: chapterId })
        setChapterContent(content)
        setChapterBaseline(content)
      })
    },
    [rootPath, runAction]
  )

  const saveChapter = useCallback(() => {
    if (selection?.type !== 'chapter') return
    const chapterId = selection.id
    void runAction('workshop.errors.save_chapter', async () => {
      await ipcApi.request('workshop.canon.commit', {
        rootPath,
        title: t('workshop.commit.save_chapter', { id: chapterId }),
        changes: [{ op: 'write_chapter', chapterId, content: chapterContent }]
      })
      setChapterBaseline(chapterContent)
      await refreshAll()
    })
  }, [chapterContent, refreshAll, rootPath, runAction, selection, t])

  const createChapter = useCallback(() => {
    const chapterId = nextChapterId(snapshot.chapterIds)
    void runAction('workshop.errors.create_chapter', async () => {
      await ipcApi.request('workshop.canon.commit', {
        rootPath,
        title: t('workshop.commit.create_chapter', { id: chapterId }),
        changes: [{ op: 'write_chapter', chapterId, content: '' }]
      })
      await refreshAll()
      setSelection({ type: 'chapter', id: chapterId })
      setChapterContent('')
      setChapterBaseline('')
    })
  }, [refreshAll, rootPath, runAction, snapshot.chapterIds, t])

  const chapterDirty = selection?.type === 'chapter' && chapterContent !== chapterBaseline
  const selectedEntity =
    selection?.type === 'entity'
      ? entities[selection.collection]?.find((entity) => entity.id === selection.id)
      : undefined

  return (
    <div data-ui="workshop.workspace" className="flex h-full min-h-0 bg-background">
      <aside className="flex w-64 shrink-0 flex-col border-border border-r bg-sidebar">
        <div className="flex items-center justify-between gap-2 border-border border-b px-3 py-2">
          <span className="truncate font-medium text-sm">{snapshot.card.title}</span>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={t('workshop.workspace.close_project')}
            onClick={onClose}>
            <X className="size-4" aria-hidden />
          </Button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-2">
          <div className="flex items-center justify-between px-1 py-1">
            <span className="font-medium text-muted-foreground text-xs uppercase">
              {t('workshop.workspace.chapters')}
            </span>
            <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={createChapter}>
              {t('workshop.workspace.new_chapter')}
            </Button>
          </div>
          <ul className="space-y-0.5">
            {snapshot.chapterIds.map((chapterId) => (
              <li key={chapterId}>
                <button
                  type="button"
                  className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-background-subtle ${
                    selection?.type === 'chapter' && selection.id === chapterId ? 'bg-background-subtle' : ''
                  }`}
                  onClick={() => openChapter(chapterId)}>
                  <FileText className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                  <span className="truncate">{chapterId}</span>
                </button>
              </li>
            ))}
          </ul>

          <div className="mt-4 px-1 py-1 font-medium text-muted-foreground text-xs uppercase">
            {t('workshop.workspace.entities')}
          </div>
          {WORKSHOP_COLLECTIONS.map((collection) => {
            const list = entities[collection] ?? []
            if (list.length === 0) return null
            return (
              <div key={collection} className="mb-2">
                <div className="px-2 py-1 text-muted-foreground text-xs">
                  {t(`workshop.collections.${collection.replace('/', '_')}`)} · {list.length}
                </div>
                <ul className="space-y-0.5">
                  {list.map((entity) => (
                    <li key={entity.id}>
                      <button
                        type="button"
                        className={`w-full truncate rounded-md px-2 py-1 text-left text-sm hover:bg-background-subtle ${
                          selection?.type === 'entity' && selection.id === entity.id ? 'bg-background-subtle' : ''
                        }`}
                        onClick={() => setSelection({ type: 'entity', collection, id: entity.id })}>
                        {entity.id}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )
          })}
        </div>
      </aside>

      <main className="flex min-w-0 flex-1 flex-col">
        {errorMessage ? (
          <p role="alert" className="m-3 rounded-md bg-error-subtle px-3 py-2 text-error-subtle-foreground text-sm">
            {errorMessage}
          </p>
        ) : null}
        {selection?.type === 'chapter' ? (
          <div className="flex min-h-0 flex-1 flex-col gap-3 p-4">
            <div className="flex items-center justify-between">
              <h2 className="font-medium text-base">{selection.id}</h2>
              <Button type="button" size="sm" disabled={!chapterDirty} loading={busy} onClick={saveChapter}>
                {t('workshop.editor.save')}
              </Button>
            </div>
            <Textarea.Input
              value={chapterContent}
              onChange={(event) => setChapterContent(event.target.value)}
              placeholder={t('workshop.editor.placeholder')}
              className="min-h-0 flex-1 resize-none font-serif leading-7"
            />
          </div>
        ) : selection?.type === 'entity' && selectedEntity ? (
          <div className="min-h-0 flex-1 overflow-y-auto p-4">
            <div className="mb-3 flex items-center gap-2">
              <h2 className="font-medium text-base">{selectedEntity.id}</h2>
              <Badge variant="outline">
                {selectedEntity.origin.kind === 'human'
                  ? t('workshop.entity.origin_human')
                  : t('workshop.entity.origin_ai')}
              </Badge>
            </div>
            <pre className="overflow-x-auto rounded-lg border border-border bg-card p-4 text-sm leading-6">
              {JSON.stringify(selectedEntity.data, null, 2)}
            </pre>
          </div>
        ) : (
          <div className="flex flex-1 items-center justify-center text-muted-foreground text-sm">
            {t('workshop.workspace.select_prompt')}
          </div>
        )}
      </main>

      <aside className="flex w-96 shrink-0 flex-col border-border border-l">
        <Tabs defaultValue="discussion" className="flex min-h-0 flex-1 flex-col">
          <TabsList className="w-full justify-start rounded-none border-border border-b bg-transparent px-2">
            <TabsTrigger value="discussion">{t('workshop.discussion.title')}</TabsTrigger>
            <TabsTrigger value="proposals">
              {t('workshop.proposals.title')}
              {proposals.filter((proposal) => proposal.status === 'pending').length > 0 ? (
                <Badge className="ml-1.5">{proposals.filter((proposal) => proposal.status === 'pending').length}</Badge>
              ) : null}
            </TabsTrigger>
            <TabsTrigger value="timeline">{t('workshop.timeline.title')}</TabsTrigger>
            <TabsTrigger value="invariants">{t('workshop.invariants.title')}</TabsTrigger>
          </TabsList>
          <TabsContent value="discussion" className="flex min-h-0 flex-1 flex-col">
            <WorkshopDiscussionPanel rootPath={rootPath} onTurnFinished={refreshAll} />
          </TabsContent>
          <TabsContent value="proposals" className="flex min-h-0 flex-1 flex-col">
            <WorkshopGeneratePanel
              rootPath={rootPath}
              selectedChapterId={selection?.type === 'chapter' ? selection.id : undefined}
              onProposalArrived={refreshAll}
            />
            <WorkshopProposalPanel
              rootPath={rootPath}
              proposals={proposals}
              busy={busy}
              onMutate={(errorKey, action) =>
                runAction(errorKey, async () => {
                  await action()
                  await refreshAll()
                })
              }
            />
          </TabsContent>
          <TabsContent value="invariants" className="flex min-h-0 flex-1 flex-col">
            <WorkshopInvariantPanel rootPath={rootPath} headCommit={snapshot.head} />
          </TabsContent>
          <TabsContent value="timeline" className="flex min-h-0 flex-1 flex-col">
            <WorkshopTimelinePanel
              headCommit={snapshot.head}
              entries={timeline}
              busy={busy}
              onRollback={(commit) =>
                runAction('workshop.errors.rollback', async () => {
                  await ipcApi.request('workshop.canon.rollback', { rootPath, commit })
                  await refreshAll()
                })
              }
            />
          </TabsContent>
        </Tabs>
      </aside>
    </div>
  )
}
