/**
 * handoff tool —— 薄适配器（模型面）。能力本体在 lib/handoff-document.mjs。
 *
 * 职责只有三件：
 *   1. 解析模板来源（`templateText` / `templatePath` 二选一，或插件 config 的默认路径）；
 *   2. 读文件与编码错误的**响亮失败**（D47：防线缺席必须响亮，不静默降级）；
 *   3. 调核心库组装，把结果包成模型可见的 text block。
 *
 * 策略不在这里：什么时候交接、模板内容、必需节、状态源，全是消费方项目的事。
 * 本适配器不创建会话、不挂侧边栏、不发首 turn（执行面属第二跳）。
 */
import { readFile } from 'node:fs/promises'
import { assembleHandoffDocument, HandoffError } from './lib/handoff-document.mjs'

/** Cordis 插件名（loader 诊断用）。 */
export const name = 'handoff-tool'

/** 模型可见的 tool 名（沿用消费方现名，避免第二跳前破坏既有调用）。 */
export const TOOL_NAME = 'handoff_tool'

/** 读模板文件：区分「不存在」与「读不了」与「不是 UTF-8」，三者都响亮。 */
async function readTemplateFile(filePath) {
  let buffer
  try {
    buffer = await readFile(filePath)
  } catch (error) {
    if (error?.code === 'ENOENT') {
      throw new HandoffError('template-missing', `template file not found: ${filePath}`)
    }
    throw new HandoffError(
      'template-unreadable',
      `template file could not be read: ${filePath} (${error?.code ?? error?.message ?? 'unknown'})`,
    )
  }
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buffer)
  } catch {
    throw new HandoffError('template-encoding', `template file is not valid UTF-8: ${filePath}`)
  }
}

/**
 * 解析本次调用使用的模板文本。
 * @param {{ templateText?: string, templatePath?: string }} args
 * @param {string | undefined} defaultTemplatePath 插件 config 的默认模板路径
 */
async function resolveTemplate(args, defaultTemplatePath) {
  const hasText = typeof args?.templateText === 'string'
  const hasPath = typeof args?.templatePath === 'string'
  if (hasText && hasPath) {
    throw new HandoffError(
      'template-source-ambiguous',
      'both templateText and templatePath were provided — pick exactly one template source',
    )
  }
  if (hasText) return args.templateText
  const filePath = hasPath ? args.templatePath : defaultTemplatePath
  if (typeof filePath !== 'string' || filePath === '') {
    throw new HandoffError(
      'template-source-missing',
      'no template source: provide templateText or templatePath (or set the plugin config templatePath)',
    )
  }
  return readTemplateFile(filePath)
}

/**
 * Cordis 插件入口：注册 `handoff_tool`。
 * @param {import('@deepseek-ai/cordis').Context} ctx
 * @param {{ templatePath?: string }} config 消费方项目可指定的默认模板路径
 */
export function apply(ctx, config = {}) {
  const defaultTemplatePath =
    typeof config?.templatePath === 'string' && config.templatePath !== '' ? config.templatePath : undefined

  ctx.tools.register({
    name: TOOL_NAME,
    description: [
      'Assemble a handoff document from facts and a template.',
      'The template is project policy: it decides which sections are required, in what order,',
      'and what static text surrounds them. Facts is a flat map of section name to text',
      '(for example boundary / snapshot / manifest / directive).',
      'Provide exactly one template source: templateText (inline) or templatePath (file).',
      'Unknown template section, missing file, or non-UTF-8 template fails loudly — the tool',
      'never falls back to a built-in default policy.',
    ].join(' '),
    parameters: {
      type: 'object',
      properties: {
        facts: {
          type: 'object',
          description: 'Section name -> section text. Every {{name}} token in the template must have a matching key.',
          additionalProperties: { type: 'string' },
        },
        templateText: {
          type: 'string',
          description: 'Inline template text. Mutually exclusive with templatePath.',
        },
        templatePath: {
          type: 'string',
          description: 'Path to a UTF-8 template file. Falls back to the plugin config templatePath when omitted.',
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
      const template = await resolveTemplate(args, defaultTemplatePath)
      const text = assembleHandoffDocument(args?.facts, { template })
      return { text }
    },
  })
}
