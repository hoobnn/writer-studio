import { useQuery } from '@data/hooks/useDataApi'
import { usePersistCache, useSharedCacheValue } from '@renderer/data/hooks/useCache'
import type { JobProgress, JobSnapshot } from '@shared/data/api/schemas/jobs'
import { isTerminalStatus } from '@shared/data/api/schemas/jobs'
import { useCallback, useEffect, useRef } from 'react'

export type WorkshopJobDomain = 'discussion' | 'generation' | 'volume'

export interface UseWorkshopJobOptions {
  rootPath: string
  domain: WorkshopJobDomain
  /** 终态回调,每个 job 恰好触发一次(含恢复挂载后才终态的场景)。 */
  onCompleted?: (snapshot: JobSnapshot) => void | Promise<void>
  onFailed?: (snapshot: JobSnapshot) => void
}

export interface WorkshopJobApi {
  jobId: string | undefined
  running: boolean
  snapshot: JobSnapshot | null
  progress: JobProgress
  start: (jobId: string) => void
}

const EMPTY_PROGRESS: JobProgress = { progress: 0 }

/**
 * 订阅式 job 观察(替代各面板手写的 setInterval 轮询):
 * 状态与进度来自 useJob 同源的 shared cache 推送,jobId 持久化在
 * ui.workshop.active_job_ids,面板卸载或应用重启后可恢复订阅。
 */
export function useWorkshopJob({ rootPath, domain, onCompleted, onFailed }: UseWorkshopJobOptions): WorkshopJobApi {
  const [activeJobs, setActiveJobs] = usePersistCache('ui.workshop.active_job_ids')
  const mapKey = JSON.stringify([rootPath, domain])
  const jobId = activeJobs[mapKey]?.jobId

  // 与 useJob 相同的双源:shared cache 为实时源,DataApi 兜底冷启动;
  // 未持有 jobId 时必须停用查询,不能复用 useJob(它无法禁用兜底请求)。
  const cacheSnapshot = useSharedCacheValue(`jobs.state.${jobId ?? ''}` as const)
  const { data: apiSnapshot, error } = useQuery(`/jobs/${jobId ?? ''}`, {
    enabled: Boolean(jobId) && cacheSnapshot == null
  })
  const snapshot = (jobId ? (cacheSnapshot ?? apiSnapshot) : null) ?? null
  const progress = useSharedCacheValue(`jobs.progress.${jobId ?? ''}` as const) ?? EMPTY_PROGRESS

  const onCompletedRef = useRef(onCompleted)
  onCompletedRef.current = onCompleted
  const onFailedRef = useRef(onFailed)
  onFailedRef.current = onFailed
  const settledJobRef = useRef<string>(undefined)

  const clearJob = useCallback(() => {
    setActiveJobs((current) => {
      if (!(mapKey in current)) return current
      const next = { ...current }
      delete next[mapKey]
      return next
    })
  }, [mapKey, setActiveJobs])

  useEffect(() => {
    if (!jobId || !snapshot || !isTerminalStatus(snapshot.status) || settledJobRef.current === jobId) return
    settledJobRef.current = jobId
    clearJob()
    if (snapshot.status === 'completed') void onCompletedRef.current?.(snapshot)
    else onFailedRef.current?.(snapshot)
  }, [clearJob, jobId, snapshot])

  // 恢复的 jobId 已被 GC(cache 空 + DataApi 404):静默清除,不触发回调。
  useEffect(() => {
    if (jobId && !snapshot && error) clearJob()
  }, [clearJob, error, jobId, snapshot])

  const start = useCallback(
    (newJobId: string) => {
      settledJobRef.current = undefined
      setActiveJobs((current) => ({ ...current, [mapKey]: { jobId: newJobId, updatedAt: new Date().toISOString() } }))
    },
    [mapKey, setActiveJobs]
  )

  return { jobId, running: Boolean(jobId), snapshot, progress, start }
}
