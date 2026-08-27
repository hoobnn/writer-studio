import type { WorkshopEntity } from '@shared/types/workshop'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { WorkshopBusyApi } from '../../hooks/useWorkshopBusy'
import { WorkshopEntityEditor } from '../WorkshopEntityEditor'

const mocks = vi.hoisted(() => ({
  request: vi.fn(),
  commits: [] as { title: string; changes: unknown[] }[]
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

const REFS = { chapters: [], characters: [], requirementsForChapter: () => [] }

function characterEntity(data: unknown): WorkshopEntity {
  return {
    schemaVersion: 1,
    id: 'lin-yuan',
    origin: { kind: 'human' },
    updatedAt: '2026-01-01T00:00:00.000Z',
    data
  } as WorkshopEntity
}

function renderEditor(
  entity: WorkshopEntity | undefined,
  extra?: { onCreated?: (id: string) => void; onDeleted?: () => void; existingIds?: string[] }
) {
  return render(
    <WorkshopEntityEditor
      rootPath="/proj"
      collection="codex/characters"
      entity={entity}
      busy={{}}
      run={run}
      refs={REFS}
      existingIds={extra?.existingIds ?? ['lin-yuan']}
      registerDirtyCheck={() => () => {}}
      onOpenVolumeRun={() => {}}
      onCreated={extra?.onCreated ?? (() => {})}
      onDeleted={extra?.onDeleted ?? (() => {})}
      onMutated={async () => {}}
    />
  )
}

const nameInput = () => screen.getByLabelText('workshop.entity_form.characters.name') as HTMLInputElement

describe('WorkshopEntityEditor 表单化', () => {
  beforeEach(() => {
    mocks.commits = []
    mocks.request.mockReset()
    mocks.request.mockImplementation(async (route: string, payload: { title: string; changes: unknown[] }) => {
      if (route === 'workshop.canon.commit') {
        mocks.commits.push(payload)
        return {}
      }
      throw new Error(`unexpected route: ${route}`)
    })
  })

  it('必填字段为空时保存被拦下:不发 IPC,字段级错误内联出现', async () => {
    const user = userEvent.setup()
    renderEditor(characterEntity({ name: '林远', role: '主角' }))
    await user.clear(nameInput())
    await user.click(screen.getByRole('button', { name: 'workshop.editor.save' }))

    expect(mocks.commits).toHaveLength(0)
    expect(screen.getByRole('alert').textContent).toContain('workshop.entity_form.error_required')

    // 修正后错误随输入消除并可保存,payload 是 schema 归一化后的数据(trim + 默认键补齐)
    await user.type(nameInput(), '  林远  ')
    await user.click(screen.getByRole('button', { name: 'workshop.editor.save' }))
    await waitFor(() => expect(mocks.commits).toHaveLength(1))
    const change = mocks.commits[0].changes[0] as {
      op: string
      id: string
      entity: { data: { name: string; aliases: string[] } }
    }
    expect(change.op).toBe('write_entity')
    expect(change.id).toBe('lin-yuan')
    expect(change.entity.data.name).toBe('林远')
    expect(change.entity.data.aliases).toEqual([])
  })

  it('JSON 逃生舱:坏 JSON 阻止切回表单,修好后编辑生效', async () => {
    const user = userEvent.setup()
    renderEditor(characterEntity({ name: '林远' }))
    await user.click(screen.getByRole('button', { name: 'workshop.entity.mode_json' }))
    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement
    expect(textarea.value).toContain('"林远"')

    await user.clear(textarea)
    await user.paste('{ broken')
    await user.click(screen.getByRole('button', { name: 'workshop.entity.mode_form' }))
    // 仍在 JSON 模式,横幅报错,内容未被丢弃
    expect(screen.getByRole('alert')).toBeTruthy()
    expect(textarea.value).toBe('{ broken')

    await user.clear(screen.getByRole('textbox'))
    await user.paste(JSON.stringify({ name: '沈刀' }))
    await user.click(screen.getByRole('button', { name: 'workshop.entity.mode_form' }))
    expect(nameInput().value).toBe('沈刀')
  })

  it('创建态:主字段联动建议 id,冲突 id 被拦下,成功后回调新 id', async () => {
    const user = userEvent.setup()
    const onCreated = vi.fn()
    renderEditor(undefined, { onCreated, existingIds: ['shen-dao'] })

    await user.type(nameInput(), 'Shen Dao')
    const idInput = screen.getByLabelText('workshop.entity.id_label') as HTMLInputElement
    // slug 被占用 → 回退到序号建议
    expect(idInput.value).toBe('char-1')

    await user.clear(idInput)
    await user.type(idInput, 'SHEN-DAO')
    await user.click(screen.getByRole('button', { name: 'workshop.editor.save' }))
    expect(mocks.commits).toHaveLength(0)
    // 大写不合法 + 与既有 id 大小写不敏感冲突,任一都必须拦下
    expect(screen.getAllByRole('alert').length).toBeGreaterThan(0)

    await user.clear(idInput)
    await user.type(idInput, 'shen-er-dao')
    await user.click(screen.getByRole('button', { name: 'workshop.editor.save' }))
    await waitFor(() => expect(onCreated).toHaveBeenCalledWith('shen-er-dao'))
    const change = mocks.commits[0].changes[0] as { op: string; id: string }
    expect(change).toMatchObject({ op: 'write_entity', id: 'shen-er-dao' })
  })

  it('删除需经确认,确认后发出 delete_entity 并回调关闭', async () => {
    const user = userEvent.setup()
    const onDeleted = vi.fn()
    renderEditor(characterEntity({ name: '林远' }), { onDeleted })

    await user.click(screen.getByRole('button', { name: 'workshop.entity.delete' }))
    await user.click(screen.getByRole('button', { name: 'common.delete' }))
    await waitFor(() => expect(onDeleted).toHaveBeenCalled())
    expect(mocks.commits[0].changes[0]).toMatchObject({ op: 'delete_entity', id: 'lin-yuan' })
  })
})
