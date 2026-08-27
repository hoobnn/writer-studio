import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useWorkshopJob } from '../useWorkshopJob'

const mocks = vi.hoisted(() => ({
  shared: {} as Record<string, unknown>,
  persist: { 'ui.workshop.active_job_ids': {} as Record<string, { jobId: string; updatedAt: string }> },
  queryError: undefined as Error | undefined
}))

vi.mock('@renderer/data/hooks/useCache', () => ({
  useSharedCacheValue: (key: string) => mocks.shared[key],
  usePersistCache: (key: 'ui.workshop.active_job_ids') => [
    mocks.persist[key],
    (update: unknown) => {
      const next = typeof update === 'function' ? update(mocks.persist[key]) : update
      mocks.persist[key] = next as (typeof mocks.persist)[typeof key]
    }
  ]
}))

vi.mock('@data/hooks/useDataApi', () => ({
  useQuery: () => ({ data: undefined, isLoading: false, error: mocks.queryError })
}))

const MAP_KEY = JSON.stringify(['/proj', 'generation'])

describe('useWorkshopJob', () => {
  beforeEach(() => {
    mocks.shared = {}
    mocks.persist['ui.workshop.active_job_ids'] = {}
    mocks.queryError = undefined
  })

  it('start 持久化 jobId,终态回调恰好一次并清除持久化条目', () => {
    const onCompleted = vi.fn()
    const { result, rerender } = renderHook(() =>
      useWorkshopJob({ rootPath: '/proj', domain: 'generation', onCompleted })
    )

    act(() => result.current.start('job-1'))
    expect(mocks.persist['ui.workshop.active_job_ids'][MAP_KEY]?.jobId).toBe('job-1')
    rerender()
    expect(result.current.running).toBe(true)

    mocks.shared['jobs.state.job-1'] = { id: 'job-1', status: 'running' }
    rerender()
    expect(onCompleted).not.toHaveBeenCalled()

    const terminal = { id: 'job-1', status: 'completed', output: { proposalId: 'p-1' } }
    mocks.shared['jobs.state.job-1'] = terminal
    rerender()
    expect(onCompleted).toHaveBeenCalledTimes(1)
    expect(onCompleted).toHaveBeenCalledWith(terminal)
    // 终态后条目清除,不再 running;后续渲染不重复触发回调。
    expect(mocks.persist['ui.workshop.active_job_ids'][MAP_KEY]).toBeUndefined()
    rerender()
    expect(onCompleted).toHaveBeenCalledTimes(1)
    expect(result.current.running).toBe(false)
  })

  it('cancelled 与 failed 走 onFailed,不触发 onCompleted', () => {
    const onCompleted = vi.fn()
    const onFailed = vi.fn()
    const { result, rerender } = renderHook(() =>
      useWorkshopJob({ rootPath: '/proj', domain: 'generation', onCompleted, onFailed })
    )
    act(() => result.current.start('job-2'))
    mocks.shared['jobs.state.job-2'] = { id: 'job-2', status: 'cancelled' }
    rerender()
    expect(onCompleted).not.toHaveBeenCalled()
    expect(onFailed).toHaveBeenCalledTimes(1)
  })

  it('恢复的 jobId 已被 GC(无快照且查询报错)时静默清除,不触发回调', () => {
    mocks.persist['ui.workshop.active_job_ids'][MAP_KEY] = { jobId: 'job-old', updatedAt: 'x' }
    mocks.queryError = new Error('404')
    const onCompleted = vi.fn()
    const onFailed = vi.fn()
    const { result, rerender } = renderHook(() =>
      useWorkshopJob({ rootPath: '/proj', domain: 'generation', onCompleted, onFailed })
    )
    rerender()
    expect(mocks.persist['ui.workshop.active_job_ids'][MAP_KEY]).toBeUndefined()
    rerender()
    expect(result.current.running).toBe(false)
    expect(onCompleted).not.toHaveBeenCalled()
    expect(onFailed).not.toHaveBeenCalled()
  })
})
