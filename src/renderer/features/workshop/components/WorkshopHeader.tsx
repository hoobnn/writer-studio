import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  NormalTooltip
} from '@cherrystudio/ui'
import {
  Download,
  Focus,
  Loader2,
  Minimize2,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  Play,
  Settings2,
  X
} from 'lucide-react'
import { useTranslation } from 'react-i18next'

export const WORKSHOP_EXPORT_FORMATS = ['markdown', 'txt', 'epub', 'docx'] as const
export type WorkshopExportFormat = (typeof WORKSHOP_EXPORT_FORMATS)[number]

interface WorkshopHeaderProps {
  title: string
  navVisible: boolean
  railVisible: boolean
  focusMode: boolean
  onToggleNav: () => void
  onToggleRail: () => void
  onToggleFocus: () => void
  /** 整卷任务运行中时的进度提示;点击回到整卷视图。 */
  volumeRunningLabel?: string
  onOpenVolumeRun: () => void
  exportBusy: boolean
  onExport: (format: WorkshopExportFormat) => void
  onOpenSettings: () => void
  onClose: () => void
}

export function WorkshopHeader({
  title,
  navVisible,
  railVisible,
  focusMode,
  onToggleNav,
  onToggleRail,
  onToggleFocus,
  volumeRunningLabel,
  onOpenVolumeRun,
  exportBusy,
  onExport,
  onOpenSettings,
  onClose
}: WorkshopHeaderProps) {
  const { t } = useTranslation()
  return (
    <header
      data-ui="workshop.header"
      className="flex h-12 shrink-0 items-center gap-3 border-border border-b-[0.5px] px-3">
      <h1 className="min-w-0 flex-1 truncate font-semibold text-sm">{title}</h1>
      {volumeRunningLabel ? (
        <button
          type="button"
          onClick={onOpenVolumeRun}
          className="flex shrink-0 items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-1 text-muted-foreground text-xs hover:bg-accent hover:text-accent-foreground">
          <Loader2 className="size-3 animate-spin" aria-hidden />
          {volumeRunningLabel}
        </button>
      ) : null}
      <div className="flex shrink-0 items-center gap-0.5">
        <NormalTooltip
          content={t(navVisible ? 'workshop.workspace.hide_nav' : 'workshop.workspace.show_nav')}
          side="bottom">
          <Button
            data-ui="workshop.header.toggle-nav"
            type="button"
            size="icon-sm"
            variant="ghost"
            aria-label={t(navVisible ? 'workshop.workspace.hide_nav' : 'workshop.workspace.show_nav')}
            aria-pressed={navVisible}
            disabled={focusMode}
            onClick={onToggleNav}>
            {navVisible ? (
              <PanelLeftClose className="size-4" aria-hidden />
            ) : (
              <PanelLeftOpen className="size-4" aria-hidden />
            )}
          </Button>
        </NormalTooltip>
        <NormalTooltip
          content={t(focusMode ? 'workshop.workspace.exit_focus' : 'workshop.workspace.enter_focus')}
          side="bottom">
          <Button
            data-ui="workshop.header.toggle-focus"
            type="button"
            size="icon-sm"
            variant={focusMode ? 'secondary' : 'ghost'}
            aria-label={t(focusMode ? 'workshop.workspace.exit_focus' : 'workshop.workspace.enter_focus')}
            aria-pressed={focusMode}
            onClick={onToggleFocus}>
            {focusMode ? <Minimize2 className="size-4" aria-hidden /> : <Focus className="size-4" aria-hidden />}
          </Button>
        </NormalTooltip>
        <NormalTooltip
          content={t(railVisible ? 'workshop.workspace.hide_rail' : 'workshop.workspace.show_rail')}
          side="bottom">
          <Button
            data-ui="workshop.header.toggle-rail"
            type="button"
            size="icon-sm"
            variant="ghost"
            aria-label={t(railVisible ? 'workshop.workspace.hide_rail' : 'workshop.workspace.show_rail')}
            aria-pressed={railVisible}
            disabled={focusMode}
            onClick={onToggleRail}>
            {railVisible ? (
              <PanelRightClose className="size-4" aria-hidden />
            ) : (
              <PanelRightOpen className="size-4" aria-hidden />
            )}
          </Button>
        </NormalTooltip>
        {!volumeRunningLabel ? (
          <NormalTooltip content={t('workshop.volume.title')} side="bottom">
            <Button
              type="button"
              size="icon-sm"
              variant="ghost"
              aria-label={t('workshop.volume.title')}
              onClick={onOpenVolumeRun}>
              <Play className="size-4" aria-hidden />
            </Button>
          </NormalTooltip>
        ) : null}
        <DropdownMenu>
          <NormalTooltip content={t('workshop.export.title')} side="bottom">
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                size="icon-sm"
                variant="ghost"
                aria-label={t('workshop.export.title')}
                loading={exportBusy}>
                <Download className="size-4" aria-hidden />
              </Button>
            </DropdownMenuTrigger>
          </NormalTooltip>
          <DropdownMenuContent align="end">
            {WORKSHOP_EXPORT_FORMATS.map((format) => (
              <DropdownMenuItem key={format} onClick={() => onExport(format)}>
                {format.toUpperCase()}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        <NormalTooltip content={t('workshop.settings.title')} side="bottom">
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            aria-label={t('workshop.settings.title')}
            onClick={onOpenSettings}>
            <Settings2 className="size-4" aria-hidden />
          </Button>
        </NormalTooltip>
        <NormalTooltip content={t('workshop.workspace.close_project')} side="bottom">
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            aria-label={t('workshop.workspace.close_project')}
            onClick={onClose}>
            <X className="size-4" aria-hidden />
          </Button>
        </NormalTooltip>
      </div>
    </header>
  )
}
