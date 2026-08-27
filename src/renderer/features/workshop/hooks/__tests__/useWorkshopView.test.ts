import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { useWorkshopView } from '../useWorkshopView'

describe('useWorkshopView', () => {
  it('编辑器为脏时导航被拦下,确认丢弃后才切换,取消则停留', () => {
    const { result } = renderHook(() => useWorkshopView())
    let dirty = true
    act(() => {
      result.current.registerDirtyCheck(() => dirty)
    })

    act(() => result.current.openChapter('ch-0001'))
    expect(result.current.view).toEqual({ kind: 'empty' })
    expect(result.current.pendingDiscard).toBe(true)

    act(() => result.current.resolveDiscard(false))
    expect(result.current.view).toEqual({ kind: 'empty' })
    expect(result.current.pendingDiscard).toBe(false)

    act(() => result.current.openChapter('ch-0001'))
    act(() => result.current.resolveDiscard(true))
    expect(result.current.view).toEqual({ kind: 'chapter', chapterId: 'ch-0001' })

    // 不脏时直接切换。
    dirty = false
    act(() => result.current.openEntity('codex/characters', 'lin-yuan'))
    expect(result.current.view).toEqual({ kind: 'entity', collection: 'codex/characters', id: 'lin-yuan' })
  })

  it('叠加视图(提案/整卷)记录来路,关闭后回到原视图', () => {
    const { result } = renderHook(() => useWorkshopView())
    act(() => result.current.openChapter('ch-0002'))
    act(() => result.current.openProposal('prop-1'))
    expect(result.current.view).toEqual({ kind: 'proposal', proposalId: 'prop-1' })

    // 叠加视图之间切换不覆盖来路锚点。
    act(() => result.current.openVolumeRun('vol-01'))
    act(() => result.current.closeView())
    expect(result.current.view).toEqual({ kind: 'chapter', chapterId: 'ch-0002' })

    // 非叠加视图关闭回到空态。
    act(() => result.current.closeView())
    expect(result.current.view).toEqual({ kind: 'empty' })
  })

  it('forceView 绕过脏守卫(供已确认流程内部跳转)', () => {
    const { result } = renderHook(() => useWorkshopView())
    act(() => {
      result.current.registerDirtyCheck(() => true)
    })
    act(() => result.current.forceView({ kind: 'chapter', chapterId: 'ch-0003' }))
    expect(result.current.view).toEqual({ kind: 'chapter', chapterId: 'ch-0003' })
    expect(result.current.pendingDiscard).toBe(false)
  })
})
