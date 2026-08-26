import { Button, Divider } from '@cherrystudio/ui'
import { SettingRow, SettingRowTitle } from '@renderer/components/SettingsPrimitives'
import { DISTRIBUTION } from '@shared/utils/distribution'
import { Briefcase, Building2, Globe, Mail, MessageSquareText, Rss } from 'lucide-react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

interface VendorAboutRowsProps {
  onOpenWebsite: (url: string) => void
  onShowReleases: () => void
  onShowEnterprise: () => void
  onMailto: () => void
  onFeedback: () => void
}

/**
 * Upstream-vendor entries (releases, website, feedback, enterprise, contact,
 * careers). Kept out of AboutSettings so this distribution's copy of that file
 * stays close to upstream and does not conflict when these rows change.
 */
export function VendorAboutRows({
  onOpenWebsite,
  onShowReleases,
  onShowEnterprise,
  onMailto,
  onFeedback
}: VendorAboutRowsProps) {
  const { t } = useTranslation()

  if (!DISTRIBUTION.upstreamServicesEnabled) return null

  return (
    <>
      <Divider className="my-3" />
      <VendorRow
        icon={<Rss className="size-4.5" />}
        title={t('settings.about.releases.title')}
        actionLabel={t('settings.about.releases.button')}
        onAction={onShowReleases}
      />
      <Divider className="my-3" />
      <VendorRow
        icon={<Globe className="size-4.5" />}
        title={t('settings.about.website.title')}
        actionLabel={t('settings.about.website.button')}
        onAction={() => onOpenWebsite('https://cherry-ai.com')}
      />
      <Divider className="my-3" />
      <VendorRow
        icon={<MessageSquareText className="size-4.5" />}
        title={t('settings.about.feedback.title')}
        actionLabel={t('settings.about.feedback.button')}
        onAction={onFeedback}
      />
      <Divider className="my-3" />
      <VendorRow
        icon={<Building2 className="size-4.5" />}
        title={t('settings.about.enterprise.title')}
        actionLabel={t('settings.about.website.button')}
        onAction={onShowEnterprise}
      />
      <Divider className="my-3" />
      <VendorRow
        icon={<Mail className="size-4.5" />}
        title={t('settings.about.contact.title')}
        actionLabel={t('settings.about.contact.button')}
        onAction={onMailto}
      />
      <Divider className="my-3" />
      <VendorRow
        icon={<Briefcase className="size-4.5" />}
        title={t('settings.about.careers.title')}
        actionLabel={t('settings.about.careers.button')}
        onAction={() => onOpenWebsite('https://www.cherry-ai.com/careers')}
      />
    </>
  )
}

function VendorRow({
  actionLabel,
  icon,
  onAction,
  title
}: {
  actionLabel: string
  icon: ReactNode
  onAction: () => void | Promise<void>
  title: string
}) {
  return (
    <SettingRow className="gap-3">
      <SettingRowTitle className="gap-2.5">
        {icon}
        {title}
      </SettingRowTitle>
      <Button size="sm" onClick={() => void onAction()} variant="outline">
        {actionLabel}
      </Button>
    </SettingRow>
  )
}
