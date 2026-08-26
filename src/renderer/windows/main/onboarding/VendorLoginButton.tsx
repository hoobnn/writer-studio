import { Button } from '@cherrystudio/ui'
import { DISTRIBUTION } from '@shared/utils/distribution'
import { LogIn } from 'lucide-react'
import { useTranslation } from 'react-i18next'

/** Vendor OAuth entry; absent in distributions without upstream accounts. */
export function VendorLoginButton({
  disabled,
  loading,
  onClick
}: {
  disabled: boolean
  loading: boolean
  onClick: () => void
}) {
  const { t } = useTranslation()

  if (!DISTRIBUTION.vendorOAuthEnabled) return null

  return (
    <Button
      type="button"
      size="lg"
      className="h-11 w-full rounded-xl"
      loading={loading}
      disabled={disabled}
      onClick={onClick}>
      {!loading && <LogIn size={16} />}
      {t('onboarding.welcome.login_cherryin')}
    </Button>
  )
}
