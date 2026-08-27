import fs from 'node:fs'
import path from 'node:path'

import JSZip from 'jszip'

import type { WorkshopKernel } from './WorkshopKernel'

/**
 * 确定性导出:同一正史 commit 导出的内容逐字节可复现(时间戳只进文件名)。
 * epub 为手工组装的最小 EPUB3(mimetype 无压缩 + nav 文档),不引入新依赖。
 */

export interface ManuscriptGroup {
  title: string
  chapters: { chapterId: string; title: string; content: string }[]
}

export interface AssembledManuscript {
  title: string
  groups: ManuscriptGroup[]
}

export async function assembleManuscript(kernel: WorkshopKernel): Promise<AssembledManuscript> {
  const card = await kernel.readProjectCard()
  const chapterIds = await kernel.listChapterIds()
  const volumes = await kernel.listEntities<{ title: string; chapterIds: string[] }>('outline/volumes')
  const plans = await kernel.listEntities<{ title: string }>('outline/chapters')
  const titleOf = (chapterId: string) => plans.find((plan) => plan.id === chapterId)?.data.title ?? chapterId

  const used = new Set<string>()
  const groups: ManuscriptGroup[] = []
  const pushGroup = async (title: string, ids: string[]) => {
    const chapters: ManuscriptGroup['chapters'] = []
    for (const chapterId of ids) {
      if (used.has(chapterId) || !chapterIds.includes(chapterId)) continue
      used.add(chapterId)
      chapters.push({ chapterId, title: titleOf(chapterId), content: await kernel.readChapter(chapterId) })
    }
    if (chapters.length > 0) groups.push({ title, chapters })
  }

  const orderedVolumes = [
    ...card.volumeOrder.map((volumeId) => volumes.find((volume) => volume.id === volumeId)).filter(Boolean),
    ...volumes.filter((volume) => !card.volumeOrder.includes(volume.id))
  ] as typeof volumes
  for (const volume of orderedVolumes) await pushGroup(volume.data.title, volume.data.chapterIds)
  await pushGroup('', [...card.looseChapterIds, ...chapterIds.filter((chapterId) => !used.has(chapterId))])
  return { title: card.title, groups }
}

export function renderMarkdown(manuscript: AssembledManuscript): string {
  const lines = [`# ${manuscript.title}`, '']
  for (const group of manuscript.groups) {
    if (group.title) lines.push(`## ${group.title}`, '')
    for (const chapter of group.chapters) {
      lines.push(`### ${chapter.title}`, '', chapter.content.trim(), '')
    }
  }
  return lines.join('\n')
}

export function renderPlainText(manuscript: AssembledManuscript): string {
  const lines = [manuscript.title, '']
  for (const group of manuscript.groups) {
    if (group.title) lines.push(group.title, '')
    for (const chapter of group.chapters) {
      lines.push(chapter.title, '', chapter.content.trim(), '')
    }
  }
  return lines.join('\n')
}

const escapeXml = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

export async function renderEpub(manuscript: AssembledManuscript): Promise<Buffer> {
  const zip = new JSZip()
  zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' })
  zip.file(
    'META-INF/container.xml',
    `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles><rootfile full-path="OEBPS/package.opf" media-type="application/oebps-package+xml"/></rootfiles>
</container>`
  )

  const chapters = manuscript.groups.flatMap((group, groupIndex) =>
    group.chapters.map((chapter) => ({ ...chapter, groupTitle: group.title, groupIndex }))
  )
  const items: string[] = []
  const spine: string[] = []
  const navPoints: string[] = []
  chapters.forEach((chapter, index) => {
    const file = `chapter-${String(index + 1).padStart(4, '0')}.xhtml`
    const paragraphs = chapter.content
      .trim()
      .split(/\n+/)
      .map((paragraph) => `<p>${escapeXml(paragraph)}</p>`)
      .join('\n')
    zip.file(
      `OEBPS/${file}`,
      `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
<head><title>${escapeXml(chapter.title)}</title></head>
<body><h2>${escapeXml(chapter.title)}</h2>
${paragraphs}
</body></html>`
    )
    items.push(`<item id="c${index}" href="${file}" media-type="application/xhtml+xml"/>`)
    spine.push(`<itemref idref="c${index}"/>`)
    navPoints.push(`<li><a href="${file}">${escapeXml(chapter.title)}</a></li>`)
  })
  zip.file(
    'OEBPS/nav.xhtml',
    `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
<head><title>目录</title></head>
<body><nav epub:type="toc"><h1>目录</h1><ol>
${navPoints.join('\n')}
</ol></nav></body></html>`
  )
  zip.file(
    'OEBPS/package.opf',
    `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="uid">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="uid">urn:workshop:${escapeXml(manuscript.title)}</dc:identifier>
    <dc:title>${escapeXml(manuscript.title)}</dc:title>
    <dc:language>zh</dc:language>
    <meta property="dcterms:modified">1970-01-01T00:00:00Z</meta>
  </metadata>
  <manifest>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
    ${items.join('\n    ')}
  </manifest>
  <spine>${spine.join('')}</spine>
</package>`
  )
  return zip.generateAsync({ type: 'nodebuffer' })
}

function sanitizeFileName(title: string): string {
  return title.replace(/[\\/:*?"<>|\s]+/g, '-').replace(/^-+|-+$/g, '') || 'novel'
}

export async function exportWorkshopManuscript(
  kernel: WorkshopKernel,
  format: 'markdown' | 'txt' | 'epub'
): Promise<{ filePath: string }> {
  const manuscript = await assembleManuscript(kernel)
  const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14)
  const dir = path.join(kernel.rootPath, 'exports')
  await fs.promises.mkdir(dir, { recursive: true })
  const base = `${sanitizeFileName(manuscript.title)}-${stamp}`
  if (format === 'markdown') {
    const filePath = path.join(dir, `${base}.md`)
    await fs.promises.writeFile(filePath, renderMarkdown(manuscript))
    return { filePath }
  }
  if (format === 'txt') {
    const filePath = path.join(dir, `${base}.txt`)
    await fs.promises.writeFile(filePath, renderPlainText(manuscript))
    return { filePath }
  }
  const filePath = path.join(dir, `${base}.epub`)
  await fs.promises.writeFile(filePath, await renderEpub(manuscript))
  return { filePath }
}
