import type { ZodType } from 'zod'

/**
 * 提示词驱动的结构化输出循环:调用方给定 zod schema 与 prompt,模型输出 JSON,
 * 解析失败时携带校验错误做有界修复重试。与 provider 无关(不依赖原生
 * structured output),是 BYOK 场景的最大公约数;将来可在同一签名下换用
 * SDK 原生 generateObject。
 */

export class StructuredGenerationError extends Error {
  constructor(
    message: string,
    readonly attempts: number,
    readonly lastOutput: string
  ) {
    super(message)
    this.name = 'StructuredGenerationError'
  }
}

/** 从模型输出中提取最可能的 JSON 对象文本:剥掉代码围栏,截取首个 `{` 到末个 `}`。 */
export function extractJsonCandidate(text: string): string | null {
  const withoutFences = text.replace(/```[a-zA-Z]*\n?/g, '').replace(/```/g, '')
  const start = withoutFences.indexOf('{')
  const end = withoutFences.lastIndexOf('}')
  if (start < 0 || end <= start) return null
  return withoutFences.slice(start, end + 1)
}

export interface StructuredGenerationInput<T> {
  schema: ZodType<T>
  prompt: string
  generate: (prompt: string) => Promise<string>
  /** 解析失败后的修复调用次数上限(默认 1)。 */
  maxRepairAttempts?: number
}

export interface StructuredGenerationResult<T> {
  object: T
  /** 实际发生的模型调用次数(1 = 一次成功)。 */
  attempts: number
}

function describeIssues(error: unknown): string {
  if (error && typeof error === 'object' && 'issues' in error && Array.isArray(error.issues)) {
    return error.issues
      .slice(0, 20)
      .map((issue) => `${(issue.path ?? []).join('.') || '(root)'}: ${issue.message}`)
      .join('\n')
  }
  return error instanceof Error ? error.message : String(error)
}

export async function runStructuredGeneration<T>(
  input: StructuredGenerationInput<T>
): Promise<StructuredGenerationResult<T>> {
  const maxAttempts = 1 + Math.max(0, input.maxRepairAttempts ?? 1)
  let prompt = input.prompt
  let lastOutput = ''

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    lastOutput = await input.generate(prompt)
    const candidate = extractJsonCandidate(lastOutput)
    let failure: string
    if (candidate === null) {
      failure = '输出中不包含 JSON 对象'
    } else {
      try {
        const parsed = input.schema.safeParse(JSON.parse(candidate))
        if (parsed.success) return { object: parsed.data, attempts: attempt }
        failure = describeIssues(parsed.error)
      } catch (error) {
        failure = `JSON 语法错误:${error instanceof Error ? error.message : String(error)}`
      }
    }
    if (attempt < maxAttempts) {
      prompt = [
        input.prompt,
        '你上一次的输出未通过校验。上一次输出如下:',
        lastOutput.slice(0, 8_000),
        '校验错误:',
        failure,
        '请只输出修正后的完整 JSON 对象,不要输出任何其他文字。'
      ].join('\n\n')
    } else {
      throw new StructuredGenerationError(
        `结构化输出在 ${attempt} 次尝试后仍未通过校验:${failure}`,
        attempt,
        lastOutput
      )
    }
  }
  throw new StructuredGenerationError('结构化输出流程未产生结果', maxAttempts, lastOutput)
}
