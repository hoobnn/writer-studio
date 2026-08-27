import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
  Button,
  NormalTooltip,
  Scrollbar,
  SearchInput,
  Tooltip
} from '@cherrystudio/ui'
import { usePersistCache } from '@renderer/data/hooks/useCache'
import type { WorkshopCollection } from '@shared/types/workshop'
import { FileText, Play, Plus } from 'lucide-react'
import type { ReactNode } from 'react'
import { useCallback, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import type { WorkshopEntityIndex } from '../hooks/useWorkshopData'
import type { WorkshopView } from '../hooks/useWorkshopView'
import { entityLabel, entitySubtitle } from '../workshopEntityPresenter'

interface WorkshopNavProps {
  chapterIds: string[]
  chapterTitle: (chapterId: string) => string | undefined
  entities: WorkshopEntityIndex
  view: WorkshopView
  createBusy: boolean
  onOpenChapter: (chapterId: string) => void
  onOpenEntity: (collection: WorkshopCollection, id: string) => void
  onCreateChapter: () => void
  onCreateEntity: (collection: WorkshopCollection) => void
  onOpenVolumeRun: (volumeId: string) => void
}

const NAV_GROUPS = [
  { id: 'codex', collections: ['codex/characters', 'codex/lore', 'codex/rules'] },
  { id: 'outline', collections: ['outline/volumes', 'outline/arcs', 'outline/chapters'] },
  {
    id: 'ledger',
    collections: ['ledger/facts', 'ledger/foreshadowing', 'ledger/summaries', 'ledger/states', 'ledger/events']
  }
] as const satisfies readonly { id: string; collections: readonly WorkshopCollection[] }[]

/** 未搜索时每个集合默认渲染的条数;台账类集合可达数千条,懒展示保住首屏。 */
const NAV_PAGE_SIZE = 30
const NAV_PAGE_INCREMENT = 100

function NavItem({
  label,
  subtitle,
  tooltip,
  active,
  icon,
  trailing,
  onClick
}: {
  label: string
  subtitle?: string
  tooltip: ReactNode
  active: boolean
  icon?: ReactNode
  trailing?: ReactNode
  onClick: () => void
}) {
  return (
    <div className="relative">
      <NormalTooltip content={tooltip} side="right">
        <button
          type="button"
          aria-current={active ? 'true' : undefined}
          onClick={onClick}
          className={`flex w-full min-w-0 items-center gap-2 rounded-md border px-2 py-1.5 text-left transition-colors ${
            active
              ? 'border-border bg-accent text-accent-foreground'
              : 'border-transparent text-foreground hover:bg-accent hover:text-accent-foreground'
          } ${trailing ? 'pr-8' : ''}`}>
          {icon}
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm">{label}</span>
            {subtitle ? <span className="block truncate text-muted-foreground text-xs">{subtitle}</span> : null}
          </span>
        </button>
      </NormalTooltip>
      {trailing}
    </div>
  )
}

export function WorkshopNav({
  chapterIds,
  chapterTitle,
  entities,
  view,
  createBusy,
  onOpenChapter,
  onOpenEntity,
  onCreateChapter,
  onCreateEntity,
  onOpenVolumeRun
}: WorkshopNavProps) {
  const { t } = useTranslation()
  const [expanded, setExpanded] = usePersistCache('ui.workshop.nav_expanded')
  const [query, setQuery] = useState('')
  const [visibleCounts, setVisibleCounts] = useState<Partial<Record<WorkshopCollection, number>>>({})

  const searching = query.trim().length > 0
  const normalizedQuery = query.trim().toLowerCase()
  const matches = useCallback(
    (...candidates: (string | undefined)[]) =>
      !normalizedQuery || candidates.some((candidate) => candidate?.toLowerCase().includes(normalizedQuery)),
    [normalizedQuery]
  )

  const filteredChapters = useMemo(
    () => chapterIds.filter((chapterId) => matches(chapterId, chapterTitle(chapterId))),
    [chapterIds, chapterTitle, matches]
  )

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 p-2">
        <SearchInput
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onClear={() => setQuery('')}
          clearLabel={t('common.clear')}
          placeholder={t('workshop.nav.search_placeholder')}
        />
      </div>
      <Scrollbar className="min-h-0 flex-1 px-2 pb-2">
        <Accordion type="multiple" value={expanded} onValueChange={setExpanded}>
          <AccordionItem value="chapters">
            <div className="flex items-center">
              <AccordionTrigger className="flex-1 py-2 font-medium text-muted-foreground text-xs uppercase">
                {t('workshop.workspace.chapters')} · {filteredChapters.length}
              </AccordionTrigger>
              <Tooltip content={t('workshop.workspace.new_chapter')}>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={t('workshop.workspace.new_chapter')}
                  disabled={createBusy}
                  onClick={onCreateChapter}>
                  <Plus className="size-3.5" aria-hidden />
                </Button>
              </Tooltip>
            </div>
            <AccordionContent className="space-y-0.5 pb-2">
              {filteredChapters.map((chapterId) => {
                const title = chapterTitle(chapterId)
                return (
                  <NavItem
                    key={chapterId}
                    label={title ?? chapterId}
                    subtitle={title ? chapterId : undefined}
                    tooltip={title ?? chapterId}
                    active={view.kind === 'chapter' && view.chapterId === chapterId}
                    icon={<FileText className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />}
                    onClick={() => onOpenChapter(chapterId)}
                  />
                )
              })}
            </AccordionContent>
          </AccordionItem>

          {NAV_GROUPS.map((group) => (
            <AccordionItem key={group.id} value={group.id}>
              <AccordionTrigger className="py-2 font-medium text-muted-foreground text-xs uppercase">
                {t(`workshop.nav.group_${group.id}`)}
              </AccordionTrigger>
              <AccordionContent className="space-y-2 pb-2">
                {group.collections.map((collection) => {
                  const list = (entities[collection] ?? []).filter((entity) =>
                    matches(entity.id, entityLabel(collection, entity), entitySubtitle(collection, entity))
                  )
                  if (searching && list.length === 0) return null
                  const visibleCount = searching ? list.length : (visibleCounts[collection] ?? NAV_PAGE_SIZE)
                  const visible = list.slice(0, visibleCount)
                  const collectionLabel = t(`workshop.collections.${collection.replace('/', '_')}`)
                  return (
                    <div key={collection}>
                      <div className="flex items-center justify-between gap-1 px-2 py-1">
                        <span className="text-muted-foreground text-xs">
                          {collectionLabel} · {list.length}
                        </span>
                        <Tooltip content={t('workshop.nav.new_entity', { name: collectionLabel })}>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            className="size-5"
                            aria-label={t('workshop.nav.new_entity', { name: collectionLabel })}
                            onClick={() => onCreateEntity(collection)}>
                            <Plus className="size-3" aria-hidden />
                          </Button>
                        </Tooltip>
                      </div>
                      <div className="space-y-0.5">
                        {visible.map((entity) => {
                          const label = entityLabel(collection, entity)
                          const subtitle = entitySubtitle(collection, entity) ?? entity.id
                          return (
                            <NavItem
                              key={entity.id}
                              label={label}
                              subtitle={subtitle === label ? undefined : subtitle}
                              tooltip={
                                <span>
                                  {label}
                                  <br />
                                  {entity.id}
                                </span>
                              }
                              active={view.kind === 'entity' && view.id === entity.id && view.collection === collection}
                              trailing={
                                collection === 'outline/volumes' ? (
                                  <Tooltip content={t('workshop.volume.title')}>
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="icon-sm"
                                      className="-translate-y-1/2 absolute top-1/2 right-1"
                                      aria-label={t('workshop.volume.title')}
                                      onClick={() => onOpenVolumeRun(entity.id)}>
                                      <Play className="size-3.5" aria-hidden />
                                    </Button>
                                  </Tooltip>
                                ) : undefined
                              }
                              onClick={() => onOpenEntity(collection, entity.id)}
                            />
                          )
                        })}
                      </div>
                      {!searching && list.length > visibleCount ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="mt-1 w-full text-muted-foreground"
                          onClick={() =>
                            setVisibleCounts((current) => ({
                              ...current,
                              [collection]: visibleCount + NAV_PAGE_INCREMENT
                            }))
                          }>
                          {t('workshop.nav.show_more', { count: list.length - visibleCount })}
                        </Button>
                      ) : null}
                    </div>
                  )
                })}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </Scrollbar>
    </div>
  )
}
