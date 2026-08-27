import fs from 'node:fs'
import path from 'node:path'

import { type WorkshopDiscussionMessage, WorkshopDiscussionMessageSchema } from '@shared/types/workshop'

/**
 * 讨论线程存储:项目内 `discussions/main.jsonl` 追加式 JSONL。
 * 有意不入正史 commit —— 回滚正史不应吞掉讨论记录;溯源经消息上的
 * proposalId 与提案元数据里的 discussionId 双向锚定。
 * 并发约束与内核一致:调用方以项目为粒度串行化。
 */

export const WORKSHOP_MAIN_DISCUSSION_ID = 'main'
const DISCUSSIONS_DIR = 'discussions'
const MAX_RETURNED_MESSAGES = 500

function threadPath(rootPath: string): string {
  const resolved = path.resolve(rootPath, DISCUSSIONS_DIR, `${WORKSHOP_MAIN_DISCUSSION_ID}.jsonl`)
  if (!resolved.startsWith(path.resolve(rootPath) + path.sep)) {
    throw new Error('Discussion path escapes the project root')
  }
  return resolved
}

export async function readDiscussion(rootPath: string): Promise<WorkshopDiscussionMessage[]> {
  let raw: string
  try {
    raw = await fs.promises.readFile(threadPath(rootPath), 'utf8')
  } catch (error) {
    if (error instanceof Error && 'code' in error && (error as NodeJS.ErrnoException).code === 'ENOENT') return []
    throw error
  }
  const messages: WorkshopDiscussionMessage[] = []
  for (const line of raw.split('\n')) {
    if (!line.trim()) continue
    try {
      messages.push(WorkshopDiscussionMessageSchema.parse(JSON.parse(line)))
    } catch {
      // 崩溃截断或历史损坏的行:跳过,不让整个线程不可读。
    }
  }
  return messages.slice(-MAX_RETURNED_MESSAGES)
}

export async function appendDiscussionMessage(rootPath: string, message: WorkshopDiscussionMessage): Promise<void> {
  const filepath = threadPath(rootPath)
  await fs.promises.mkdir(path.dirname(filepath), { recursive: true })
  await fs.promises.appendFile(filepath, `${JSON.stringify(WorkshopDiscussionMessageSchema.parse(message))}\n`)
}

export async function discussionMessageExists(rootPath: string, messageId: string): Promise<boolean> {
  const messages = await readDiscussion(rootPath)
  return messages.some((message) => message.id === messageId)
}
