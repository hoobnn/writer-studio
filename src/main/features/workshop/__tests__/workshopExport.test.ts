import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { assembleManuscript, exportWorkshopManuscript, renderMarkdown, renderPlainText } from '../workshopExport'
import { WorkshopKernel } from '../WorkshopKernel'

const roots: string[] = []

afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true })
})

async function projectWithBook(): Promise<WorkshopKernel> {
  const parent = await mkdtemp(path.join(tmpdir(), 'workshop-export-'))
  roots.push(parent)
  const kernel = await WorkshopKernel.createProject(path.join(parent, 'novel'), { title: '漂流之城' })
  const now = new Date().toISOString()
  await kernel.commitCanon({
    title: '成书',
    origin: { kind: 'human' },
    changes: [
      {
        op: 'write_entity',
        collection: 'outline/volumes',
        id: 'vol-1',
        entity: {
          schemaVersion: 1,
          id: 'vol-1',
          origin: { kind: 'human' },
          updatedAt: now,
          data: { title: '第一卷 启航', chapterIds: ['ch-0002', 'ch-0001'] }
        }
      },
      {
        op: 'write_entity',
        collection: 'outline/chapters',
        id: 'ch-0001',
        entity: {
          schemaVersion: 1,
          id: 'ch-0001',
          origin: { kind: 'human' },
          updatedAt: now,
          data: { title: '第一章 海风' }
        }
      },
      { op: 'write_chapter', chapterId: 'ch-0001', content: '风从海上来。' },
      { op: 'write_chapter', chapterId: 'ch-0002', content: '城在云中漂。' },
      { op: 'write_chapter', chapterId: 'ch-0003', content: '未分卷的尾声。' }
    ]
  })
  return kernel
}

describe('workshopExport', () => {
  it('按卷序组稿:卷内顺序取自卷定义,未分卷章节归入末尾组', async () => {
    const kernel = await projectWithBook()
    const manuscript = await assembleManuscript(kernel)
    expect(manuscript.title).toBe('漂流之城')
    expect(manuscript.groups).toHaveLength(2)
    expect(manuscript.groups[0].title).toBe('第一卷 启航')
    expect(manuscript.groups[0].chapters.map((chapter) => chapter.chapterId)).toEqual(['ch-0002', 'ch-0001'])
    expect(manuscript.groups[0].chapters[1].title).toBe('第一章 海风')
    expect(manuscript.groups[1].chapters.map((chapter) => chapter.chapterId)).toEqual(['ch-0003'])
  })

  it('markdown 与纯文本渲染包含书名、卷名、章名与正文', async () => {
    const kernel = await projectWithBook()
    const manuscript = await assembleManuscript(kernel)
    const markdown = renderMarkdown(manuscript)
    expect(markdown).toContain('# 漂流之城')
    expect(markdown).toContain('## 第一卷 启航')
    expect(markdown).toContain('### 第一章 海风')
    expect(markdown).toContain('风从海上来。')
    const text = renderPlainText(manuscript)
    expect(text).toContain('漂流之城')
    expect(text).not.toContain('#')
  })

  it('三种文件格式落盘且 epub 为合法 zip(mimetype 未压缩打头)', async () => {
    const kernel = await projectWithBook()
    for (const format of ['markdown', 'txt', 'epub'] as const) {
      const { filePath } = await exportWorkshopManuscript(kernel, format)
      const buffer = await readFile(filePath)
      expect(buffer.length).toBeGreaterThan(0)
      if (format === 'epub') {
        expect(buffer.subarray(0, 2).toString()).toBe('PK')
        expect(buffer.subarray(0, 100).toString('latin1')).toContain('mimetype')
      }
    }
  })
})
