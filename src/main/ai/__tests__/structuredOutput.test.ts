import { describe, expect, it, vi } from 'vitest'
import * as z from 'zod'

import { extractJsonCandidate, runStructuredGeneration, StructuredGenerationError } from '../structuredOutput'

const schema = z.strictObject({ name: z.string().min(1), count: z.number().int() })

describe('extractJsonCandidate', () => {
  it('剥离代码围栏并截取对象', () => {
    expect(extractJsonCandidate('前言\n```json\n{"a":1}\n```\n后记')).toBe('{"a":1}')
  })

  it('无对象时返回 null', () => {
    expect(extractJsonCandidate('没有任何结构化内容')).toBeNull()
  })
})

describe('runStructuredGeneration', () => {
  it('一次通过时不做修复调用', async () => {
    const generate = vi.fn().mockResolvedValue('```json\n{"name":"甲","count":2}\n```')
    const result = await runStructuredGeneration({ schema, prompt: 'p', generate })
    expect(result).toEqual({ object: { name: '甲', count: 2 }, attempts: 1 })
    expect(generate).toHaveBeenCalledTimes(1)
  })

  it('首次校验失败后携带错误修复重试并成功', async () => {
    const generate = vi
      .fn()
      .mockResolvedValueOnce('{"name":"","count":"x"}')
      .mockResolvedValueOnce('{"name":"乙","count":3}')
    const result = await runStructuredGeneration({ schema, prompt: '原始任务', generate })
    expect(result.object).toEqual({ name: '乙', count: 3 })
    expect(result.attempts).toBe(2)
    const repairPrompt = generate.mock.calls[1][0] as string
    expect(repairPrompt).toContain('原始任务')
    expect(repairPrompt).toContain('校验错误')
  })

  it('超过修复上限后抛出并保留最后输出', async () => {
    const generate = vi.fn().mockResolvedValue('不是 JSON')
    await expect(runStructuredGeneration({ schema, prompt: 'p', generate, maxRepairAttempts: 1 })).rejects.toThrowError(
      StructuredGenerationError
    )
    expect(generate).toHaveBeenCalledTimes(2)
  })
})
