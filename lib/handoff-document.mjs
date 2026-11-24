/**
 * handoff 文档组装 —— 纯函数核心（无 IO、无时钟、无项目语义）。
 *
 * 接口（唯一对外面）：
 *   assembleHandoffDocument(facts, { template }) -> string
 *   HandoffError{ code, message }
 *
 * 语义：
 *   - `facts` 是「节名 → 节文本」的平坦映射；`template` 是文本，用 `{{节名}}` 引用节；
 *   - 模板决定哪些节必需、以什么顺序出现、周围的静态文本长什么样；
 *   - 引用一个 facts 没有的节 → section-missing（点名该节；这是模板笔误的响亮面）；
 *   - 替换是**一次性**的：facts 文本里出现的 `{{...}}` 原样保留，不做递归插值（防注入）；
 *   - 结果全空白 → document-empty（空交接文档比失败更糟，必须响亮）。
 *
 * 不做的事（属消费方策略）：读文件 / 决定模板 / 判断「该不该交接」/ 任何项目专属节。
 */

/** 组装失败的统一错误：`code` 是稳定判据，消息面向人。 */
export class HandoffError extends Error {
  constructor(code, message) {
    super(message)
    this.name = 'HandoffError'
    this.code = code
  }
}

/** 模板 token：`{{section-name}}`（字母开头，允许字母数字、下划线、连字符）。 */
const TOKEN = /\{\{([A-Za-z][A-Za-z0-9_-]*)\}\}/g

const isPlainObject = (value) =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/**
 * 把 facts 组装成交接文档文本。
 * @param {Record<string, string>} facts 节名 → 节文本
 * @param {{ template: string }} options 模板文本
 * @returns {string}
 */
export function assembleHandoffDocument(facts, { template } = {}) {
  if (typeof template !== 'string' || template.trim() === '') {
    throw new HandoffError(
      'template-invalid',
      `template must be a non-empty string (got ${template === null ? 'null' : typeof template})`,
    )
  }
  if (!isPlainObject(facts)) {
    throw new HandoffError(
      'facts-invalid',
      `facts must be a plain object of sectionName -> text (got ${facts === null ? 'null' : Array.isArray(facts) ? 'array' : typeof facts})`,
    )
  }

  const out = template.replace(TOKEN, (_match, key) => {
    if (!Object.hasOwn(facts, key)) {
      throw new HandoffError(
        'section-missing',
        `template references section "${key}" but facts does not provide it (provided: ${Object.keys(facts).join(', ') || 'none'})`,
      )
    }
    const value = facts[key]
    return typeof value === 'string' ? value : String(value ?? '')
  })

  if (out.trim() === '') {
    throw new HandoffError(
      'document-empty',
      'assembled handoff document is empty after substitution (template and every referenced section are blank)',
    )
  }
  return out
}
