import { Badge, EmptyState, Scrollbar, SegmentedControl } from '@cherrystudio/ui'
import type { WorkshopProposal } from '@shared/types/workshop'
import { ChevronRight } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { WORKSHOP_PROPOSAL_FILTER_LABEL_KEYS, WORKSHOP_PROPOSAL_STATUS_LABEL_KEYS } from '../workshopI18nKeys'

interface WorkshopProposalPanelProps {
  proposals: WorkshopProposal[]
  /** 刚生成的提案 id,列表中短暂高亮。 */
  highlightId?: string
  onOpen: (proposalId: string) => void
}

const FILTERS = ['pending', 'all', 'applied', 'rejected'] as const
type ProposalFilter = (typeof FILTERS)[number]

export function WorkshopProposalPanel({ proposals, highlightId, onOpen }: WorkshopProposalPanelProps) {
  const { t } = useTranslation()
  const [filter, setFilter] = useState<ProposalFilter>('pending')

  const visible = proposals.filter((proposal) => filter === 'all' || proposal.status === filter)

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="shrink-0 p-2">
        <SegmentedControl<ProposalFilter>
          size="sm"
          aria-label={t('workshop.proposals.title')}
          value={filter}
          onValueChange={setFilter}
          options={FILTERS.map((candidate) => ({
            value: candidate,
            label: t(WORKSHOP_PROPOSAL_FILTER_LABEL_KEYS[candidate])
          }))}
        />
      </div>
      {visible.length === 0 ? (
        <EmptyState compact description={t('workshop.proposals.empty')} />
      ) : (
        <Scrollbar className="min-h-0 flex-1 space-y-1.5 px-2 pb-2">
          {visible.map((proposal) => (
            <button
              key={proposal.id}
              type="button"
              onClick={() => onOpen(proposal.id)}
              className={`flex w-full items-center gap-2 rounded-lg border border-border px-3 py-2 text-left transition-colors hover:bg-accent ${
                proposal.id === highlightId ? 'bg-accent' : 'bg-card'
              }`}>
              <span className="min-w-0 flex-1 truncate text-sm">{proposal.title}</span>
              <Badge
                variant={
                  proposal.status === 'pending' ? 'default' : proposal.status === 'applied' ? 'secondary' : 'outline'
                }>
                {t(WORKSHOP_PROPOSAL_STATUS_LABEL_KEYS[proposal.status])}
              </Badge>
              {proposal.stale ? <Badge variant="destructive">{t('workshop.proposals.stale')}</Badge> : null}
              <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
            </button>
          ))}
        </Scrollbar>
      )}
    </div>
  )
}
