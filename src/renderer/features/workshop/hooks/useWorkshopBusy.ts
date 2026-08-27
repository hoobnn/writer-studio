import { toast } from '@renderer/services/toast'
import { getErrorMessage } from '@renderer/utils/error'
import { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'

/** 域级 busy:每个操作域独立置忙,避免一个全局布尔把所有按钮一起锁死。 */
export type WorkshopBusyDomain = 'chapterSave' | 'entitySave' | 'proposal' | 'rollback' | 'export' | 'create'

export type WorkshopBusyState = Partial<Record<WorkshopBusyDomain, boolean>>

export interface WorkshopBusyApi {
  busy: WorkshopBusyState
  /** 执行操作并管理对应域的 busy;失败弹错误 toast,返回是否成功。 */
  run: (domain: WorkshopBusyDomain, errorKey: string, action: () => Promise<void>) => Promise<boolean>
}

export function useWorkshopBusy(): WorkshopBusyApi {
  const { t } = useTranslation()
  const [busy, setBusy] = useState<WorkshopBusyState>({})

  const run = useCallback(
    async (domain: WorkshopBusyDomain, errorKey: string, action: () => Promise<void>): Promise<boolean> => {
      setBusy((current) => ({ ...current, [domain]: true }))
      try {
        await action()
        return true
      } catch (error) {
        toast.error({ title: t(errorKey), description: getErrorMessage(error) })
        return false
      } finally {
        setBusy((current) => ({ ...current, [domain]: false }))
      }
    },
    [t]
  )

  return { busy, run }
}
