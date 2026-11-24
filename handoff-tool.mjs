/**
 * handoff tool —— 薄适配器（模型面）。能力本体在 lib/handoff-document.mjs。
 *
 * 职责只有三件：
 *   1. 解析模板来源（`templateText` / `templatePath` 二选一，**没有**隐式默认）；
 *   2. 读文件与编码错误的**响亮失败**（D47：防线缺席必须响亮，不静默降级）；
 *   3. 调核心库组装，把结果包成模型可见的 text block。
 *
 * 策略不在这里：什么时候交接、模板内容、必需节、状态源，全是消费方项目的事；
 * 模板位置也必须由调用方显式给（插件配置不提供默认源，避免绕过「二选一」契约）。
 * 本适配器不创建会话、不挂侧边栏、不发首 turn（执行面属第二跳）。
 */
import { readFile } from 'node:fs/promises'
import { assembleHandoffDocument, HandoffError, HANDOFF_ERRORS } from './lib/handoff-document.mjs'

/** Cordis 插件名（loader 诊断用）。 */
export const name = 'handoff-tool'

/** 模型可见的 tool 名（沿用消费方现名，避免第二跳前破坏既有调用）。 */
export const TOOL_NAME = 'handoff_tool'

/** 适配器专属错误码（lib 的错误码见 HANDOFF_ERRORS）。 */
export const TOOL_ERRORS = Object.freeze({
  SOURCE_AMBIGUOUS: 'template-source-ambiguous',
  SOURCE_MISSING: 'template-source-missing',
  FILE_MISSING: 'template-missing',
  FILE_UNREADABLE: 'template-unreadable',
  FILE_ENCODING: 'template-encoding',
})

/** 读模板文件：区分「不存在」「读不了」「不是 UTF-8」，三者都响亮。 */
async function readTemplateFile(filePath) {
  let buffer
  try {
    buffer = await readFile(filePath)
  } catch (error) {
    if (error?.code === 'ENOENT') {
      throw new HandoffError(TOOL_ERRORS.FILE_MISSING, `template file not found: ${filePath}`)
    }
    throw new HandoffError(
      TOOL_ERRORS.FILE_UNREADABLE,
      `template file could not be read: ${filePath} (${error?.code ?? error?.message ?? 'unknown'})`,
    )
  }
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buffer)
  } catch {
    throw new HandoffError(TOOL_ERRORS.FILE_ENCODING, `template file is not valid UTF-8: ${filePath}`)
  }
}

/**
 * 解析本次调用使用的模板文本：`templateText` 与 `templatePath` **恰一个**。
 * @param {{ templateText?: string, templatePath?: string }} args
 */
async function resolveTemplate(args) {
  const hasText = typeof args?.templateText === 'string'
  const hasPath = typeof args?.templatePath === 'string'
  if (hasText && hasPath) {
    throw new HandoffError(
      TOOL_ERRORS.SOURCE_AMBIGUOUS,
      'both templateText and templatePath were provided — pick exactly one template source',
    )
  }
  if (hasText) return args.templateText
  if (hasPath) return readTemplateFile(args.templatePath)
  throw new HandoffError(
    TOOL_ERRORS.SOURCE_MISSING,
    'no template source: provide templateText or templatePath (this tool has no implicit default template)',
  )
}

/**
 * Cordis 插件入口：注册 `handoff_tool`。
 * @param {import('@deepseek-ai/cordis').Context} ctx
 */
export function apply(ctx) {
  ctx.tools.register({
    name: TOOL_NAME,
    description: [
      'Assemble a handoff document from facts and a template.',
      'The template is project policy: it decides which sections are required, in what order,',
      'and what static text surrounds them. Facts is a flat map of section name to text',
      '(for example boundary / snapshot / manifest / directive).',
      'Provide exactly one template source: templateText (inline) or templatePath (file).',
      'Unknown template section, malformed token, missing file, or non-UTF-8 template fails',
      'loudly — the tool never falls back to a built-in default policy or template.',
    ].join(' '),
    parameters: {
      type: 'object',
      properties: {
        facts: {
          type: 'object',
          description: 'Section name -> section text (values must be strings). Every {{name}} token in the template must have a matching key.',
          additionalProperties: { type: 'string' },
        },
        templateText: {
          type: 'string',
          description: 'Inline template text. Mutually exclusive with templatePath.',
        },
        templatePath: {
          type: 'string',
          description: 'Path to a UTF-8 template file. Mutually exclusive with templateText.',
        },
      },
      required: ['facts'],
      additionalProperties: false,
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: { text: { type: 'string' } },
        required: ['text'],
      },
      render: (_args, value) => [{ type: 'text', text: value.text }],
    },
    async execute(args) {
      const template = await resolveTemplate(args)
      const text = assembleHandoffDocument(args?.facts, { template })
      return { text }
    },
  })
}
