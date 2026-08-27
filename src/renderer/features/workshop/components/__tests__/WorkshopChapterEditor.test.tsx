import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { WorkshopBusyApi } from '../../hooks/useWorkshopBusy'
import { WorkshopChapterEditor } from '../WorkshopChapterEditor'

const mocks = vi.hoisted(() => ({
  request: vi.fn(),
  canon: '',
  commits: [] as unknown[]
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key })
}))

vi.mock('@renderer/ipc', () => ({
  ipcApi: { request: mocks.request }
}))

vi.mock('@renderer/hooks/command', () => ({
  useCommandHandler: () => {}
}))

const run: WorkshopBusyApi['run'] = async (_domain, _errorKey, action) => {
  try {
    await action()
    return true
  } catch {
    return false
  }
}

function renderEditor(headCommit: string) {
  return render(
    <WorkshopChapterEditor
      rootPath="/proj"
      chapterId="ch-0001"
      headCommit={headCommit}
      busy={{}}
      run={run}
      registerDirtyCheck={() => () => {}}
      onSaved={async () => {}}
      onMissing={() => {}}
    />
  )
}

const textarea = () => screen.getByPlaceholderText('workshop.editor.placeholder') as HTMLTextAreaElement

describe('WorkshopChapterEditor 正史对账', () => {
  beforeEach(() => {
    mocks.commits = []
    mocks.canon = 'v1'
    mocks.request.mockReset()
    mocks.request.mockImplementation(async (route: string, payload: unknown) => {
      if (route === 'workshop.chapter.read') return { content: mocks.canon }
      if (route === 'workshop.canon.commit') {
        mocks.commits.push(payload)
        return {}
      }
      throw new Error(`unexpected route: ${route}`)
    })
  })

  it('草稿为脏时正史更新不覆盖正文,出现冲突条;加载正史才替换', async () => {
    const user = userEvent.setup()
    const view = renderEditor('c1')
    await waitFor(() => expect(textarea().value).toBe('v1'))

    await user.type(textarea(), '!draft')
    expect(textarea().value).toBe('v1!draft')

    // 后台刷新(如提案应用/回滚)推进 head,正史内容已变。
    mocks.canon = 'v2'
    view.rerender(
      <WorkshopChapterEditor
        rootPath="/proj"
        chapterId="ch-0001"
        headCommit="c2"
        busy={{}}
        run={run}
        registerDirtyCheck={() => () => {}}
        onSaved={async () => {}}
        onMissing={() => {}}
      />
    )

    await screen.findByRole('alert')
    // 数据丢失回归断言:未保存草稿必须原样保留。
    expect(textarea().value).toBe('v1!draft')

    await user.click(screen.getByRole('button', { name: 'workshop.editor.conflict_reload' }))
    expect(textarea().value).toBe('v2')
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('草稿未动时正史更新静默采纳,不打扰作者', async () => {
    const view = renderEditor('c1')
    await waitFor(() => expect(textarea().value).toBe('v1'))

    mocks.canon = 'v2'
    view.rerender(
      <WorkshopChapterEditor
        rootPath="/proj"
        chapterId="ch-0001"
        headCommit="c2"
        busy={{}}
        run={run}
        registerDirtyCheck={() => () => {}}
        onSaved={async () => {}}
        onMissing={() => {}}
      />
    )
    await waitFor(() => expect(textarea().value).toBe('v2'))
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('保留本稿后可保存,提交内容为本稿并转入已保存状态', async () => {
    const user = userEvent.setup()
    const view = renderEditor('c1')
    await waitFor(() => expect(textarea().value).toBe('v1'))
    await user.type(textarea(), '!draft')

    mocks.canon = 'v2'
    view.rerender(
      <WorkshopChapterEditor
        rootPath="/proj"
        chapterId="ch-0001"
        headCommit="c2"
        busy={{}}
        run={run}
        registerDirtyCheck={() => () => {}}
        onSaved={async () => {}}
        onMissing={() => {}}
      />
    )
    await screen.findByRole('alert')
    await user.click(screen.getByRole('button', { name: 'workshop.editor.conflict_keep' }))
    expect(screen.queryByRole('alert')).toBeNull()
    expect(textarea().value).toBe('v1!draft')

    await user.click(screen.getByRole('button', { name: 'workshop.editor.save' }))
    await waitFor(() => expect(mocks.commits).toHaveLength(1))
    expect(mocks.commits[0]).toMatchObject({
      changes: [{ op: 'write_chapter', chapterId: 'ch-0001', content: 'v1!draft' }]
    })
    await waitFor(() => expect(screen.getByText('workshop.editor.status_saved')).toBeTruthy())
  })
})
