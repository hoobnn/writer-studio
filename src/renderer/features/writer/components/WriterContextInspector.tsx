import { Badge } from '@cherrystudio/ui'
import type { WriterContextPacket } from '@shared/types/writer'
import { ChevronRight } from 'lucide-react'
import { useTranslation } from 'react-i18next'

interface WriterContextInspectorProps {
  packet: WriterContextPacket
  title: string
}

export function WriterContextInspector({ packet, title }: WriterContextInspectorProps) {
  const { t } = useTranslation()
  const usage = packet.budgetChars > 0 ? Math.min(100, Math.round((packet.usedChars / packet.budgetChars) * 100)) : 0

  return (
    <section data-ui="writer.context.inspector" className="space-y-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-medium text-xs">{title}</h3>
        <div className="flex items-center gap-1.5">
          {packet.truncated ? <Badge variant="outline">{t('writer.copilot.truncated')}</Badge> : null}
          <Badge variant="outline">{t('writer.context.source_count', { count: packet.sources.length })}</Badge>
        </div>
      </div>
      <div className="space-y-1">
        <div className="flex items-center justify-between gap-3 text-[11px] text-muted-foreground">
          <span>{t('writer.context.budget')}</span>
          <span className="tabular-nums">
            {packet.usedChars.toLocaleString()} / {packet.budgetChars.toLocaleString()}
          </span>
        </div>
        <div
          role="progressbar"
          aria-label={t('writer.context.budget_usage', { percent: usage })}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={usage}
          className="h-1.5 overflow-hidden rounded-full bg-background">
          <div className="h-full rounded-full bg-primary" style={{ width: `${usage}%` }} />
        </div>
      </div>
      <div className="divide-y divide-border overflow-hidden rounded-md border border-border bg-background">
        {packet.sources.map((source, index) => (
          <details key={`${source.kind}-${source.label}-${index}`} className="group">
            <summary className="flex cursor-pointer list-none items-center gap-2 px-2.5 py-2 text-xs marker:content-none">
              <ChevronRight
                className="size-3.5 shrink-0 text-muted-foreground transition-transform group-open:rotate-90"
                aria-hidden
              />
              <span className="min-w-0 flex-1 truncate">{source.label}</span>
              {source.truncated ? (
                <Badge variant="outline" className="shrink-0 px-1.5 py-0 text-[10px]">
                  {t('writer.context.trimmed')}
                </Badge>
              ) : null}
            </summary>
            <pre className="max-h-48 overflow-auto whitespace-pre-wrap border-border border-t px-2.5 py-2 font-sans text-[11px] leading-5">
              {source.content}
            </pre>
          </details>
        ))}
      </div>
      {packet.loreActivations?.length ? (
        <div className="space-y-1.5">
          <h4 className="font-medium text-muted-foreground text-xs">{t('writer.copilot.lore_receipts')}</h4>
          <div className="flex flex-wrap gap-1">
            {packet.loreActivations.map((receipt) => (
              <Badge key={receipt.entryId} variant="outline" className="max-w-full gap-1">
                <span className="truncate">{receipt.title}</span>
                <span>
                  {t(
                    receipt.status === 'included'
                      ? 'writer.copilot.lore_status.included'
                      : 'writer.copilot.lore_status.dropped'
                  )}
                </span>
                {receipt.truncated ? <span>{t('writer.context.trimmed')}</span> : null}
              </Badge>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  )
}
