import { Button, Textarea } from '@cherrystudio/ui'
import { useCommandHandler } from '@renderer/hooks/command'
import { ipcApi } from '@renderer/ipc'
import { toast } from '@renderer/services/toast'
import { Loader2 } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import type { WorkshopBusyApi } from '../hooks/useWorkshopBusy'

interface WorkshopChapterEditorProps {
  rootPath: string
  chapterId: string
  /** 章计划标题(无计划时展示 chapterId)。 */
  title?: string
  /** 正史 head;变化时编辑器自行对账,后台刷新永不直接覆盖草稿。 */
  headCommit: string
  busy: WorkshopBusyApi['busy']
  run: WorkshopBusyApi['run']
  registerDirtyCheck: (check: () => boolean) => () => void
  /** 保存入正史后刷新工作区(snapshot + 侧栏数据)。 */
  onSaved: () => Promise<void>
  /** 章节已不存在(如被回滚删除)时关闭视图。 */
  onMissing: () => void
}

/**
 * 章节编辑器:content/baseline 全部下沉在此组件内(以 key={chapterId} 挂载),
 * 外部刷新只送入 headCommit,由本组件决定采纳正史还是提示冲突——这是
 * "refreshAll 静默覆盖未保存正文"数据丢失路径的结构性修复。
 */
export function WorkshopChapterEditor({
  rootPath,
  chapterId,
  title,
  headCommit,
  busy,
  run,
  registerDirtyCheck,
  onSaved,
  onMissing
}: WorkshopChapterEditorProps) {
  const { t } = useTranslation()
  const [status, setStatus] = useState<'loading' | 'ready'>('loading')
  const [content, setContent] = useState('')
  const [baseline, setBaseline] = useState('')
  /** 与本稿冲突、等待作者裁决的正史内容。 */
  const [conflictCanon, setConflictCanon] = useState<string>()

  const contentRef = useRef(content)
  contentRef.current = content
  const baselineRef = useRef(baseline)
  baselineRef.current = baseline
  const reconciledHeadRef = useRef(headCommit)
  const onMissingRef = useRef(onMissing)
  onMissingRef.current = onMissing

  useEffect(() => {
    let cancelled = false
    ipcApi
      .request('workshop.chapter.read', { rootPath, chapterId })
      .then(({ content: canon }) => {
        if (cancelled) return
        setContent(canon)
        setBaseline(canon)
        setStatus('ready')
      })
      .catch(() => {
        if (!cancelled) onMissingRef.current()
      })
    return () => {
      cancelled = true
    }
  }, [rootPath, chapterId])

  useEffect(() => {
    if (status !== 'ready' || headCommit === reconciledHeadRef.current) return
    reconciledHeadRef.current = headCommit
    let cancelled = false
    void (async () => {
      try {
        const { content: canon } = await ipcApi.request('workshop.chapter.read', { rootPath, chapterId })
        if (cancelled || canon === baselineRef.current) return
        if (contentRef.current === baselineRef.current || contentRef.current === canon) {
          setContent(canon)
          setBaseline(canon)
          setConflictCanon(undefined)
        } else {
          setConflictCanon(canon)
        }
      } catch {
        if (!cancelled) onMissingRef.current()
      }
    })()
    return () => {
      cancelled = true
    }
  }, [chapterId, headCommit, rootPath, status])

  const dirty = status === 'ready' && content !== baseline
  useEffect(() => registerDirtyCheck(() => contentRef.current !== baselineRef.current), [registerDirtyCheck])

  const save = useCallback(async () => {
    const draft = contentRef.current
    const ok = await run('chapterSave', 'workshop.errors.save_chapter', async () => {
      await ipcApi.request('workshop.canon.commit', {
        rootPath,
        title: t('workshop.commit.save_chapter', { id: chapterId }),
        changes: [{ op: 'write_chapter', chapterId, content: draft }]
      })
      setBaseline(draft)
      setConflictCanon(undefined)
      await onSaved()
    })
    if (ok) toast.success(t('common.saved'))
  }, [chapterId, onSaved, rootPath, run, t])

  const saving = Boolean(busy.chapterSave)
  useCommandHandler('workshop.save', () => void save(), { enabled: dirty && !saving })

  if (status === 'loading') {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="size-5 animate-spin text-muted-foreground" aria-hidden />
      </div>
    )
  }

  const wordCount = content.replace(/\s+/g, '').length
  return (
    <div data-ui="workshop.chapter-editor" className="flex h-full min-h-0 flex-col gap-3 p-4">
      <div className="flex items-center gap-2">
        <h2 className="min-w-0 truncate font-medium text-base">{title ?? chapterId}</h2>
        {title ? <span className="shrink-0 text-muted-foreground text-xs">{chapterId}</span> : null}
        <div className="flex-1" />
        <span className="shrink-0 text-muted-foreground text-xs">
          {t('workshop.editor.word_count', { chars: wordCount })}
        </span>
        <span className="shrink-0 text-muted-foreground text-xs" aria-live="polite">
          {saving
            ? t('workshop.editor.status_saving')
            : dirty
              ? t('workshop.editor.status_dirty')
              : t('workshop.editor.status_saved')}
        </span>
        <Button type="button" size="sm" disabled={!dirty} loading={saving} onClick={() => void save()}>
          {t('workshop.editor.save')}
        </Button>
      </div>
      {conflictCanon !== undefined ? (
        <div
          role="alert"
          className="flex items-center gap-2 rounded-md border border-warning-border bg-warning-subtle px-3 py-2 text-sm text-warning-subtle-foreground">
          <span className="min-w-0 flex-1">{t('workshop.editor.conflict_description')}</span>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => {
              setContent(conflictCanon)
              setBaseline(conflictCanon)
              setConflictCanon(undefined)
            }}>
            {t('workshop.editor.conflict_reload')}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => {
              setBaseline(conflictCanon)
              setConflictCanon(undefined)
            }}>
            {t('workshop.editor.conflict_keep')}
          </Button>
        </div>
      ) : null}
      <Textarea.Input
        value={content}
        onChange={(event) => setContent(event.target.value)}
        placeholder={t('workshop.editor.placeholder')}
        className="min-h-0 flex-1 resize-none font-serif leading-7"
      />
    </div>
  )
}
