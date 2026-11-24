/**
 * handoff 文档组装 —— 纯函数核心（无 IO、无时钟、无项目语义）。
 *
 * 接口（唯一对外面）：
 *   assembleHandoffDocument(facts, { template }) -> string
 *   HandoffError{ code, message }
 *   HANDOFF_ERRORS（稳定错误码常量，消费方与守卫共用；不要在别处抄裸串）
 *
 * 语义：
 *   - `facts` 是「节名 → 节文本」的平坦映射（**值必须是字符串**，形状不符响亮失败）；
 *   - `template` 是文本，用 `{{节名}}` 引用节；节名允许两侧空白与任意文字（含中文），
 *     不允许空白/花括号出现在节名内部；
 *   - 模板决定哪些节必需、以什么顺序出现、周围的静态文本长什么样；
 *   - 任何 `{{…}}` 都必须能解析：引用 facts 没有的节 → section-missing（点名），
 *     形状坏（未闭合 / 空 / 含空白或花括号）→ template-invalid（点名原文）；
 *   - 替换是**一次性**的：facts 文本里出现的 `{{...}}` 原样保留，不做递归插值（防注入）；
 *   - 结果全空白 → document-empty（空交接文档比失败更糟，必须响亮）。
 *
 * 不做的事（属消费方策略）：读文件 / 决定模板 / 判断「该不该交接」/ 任何项目专属节。
 */

/** 稳定错误码（唯一事实源；消费方与守卫从这里取，不在别处抄裸串）。 */
export const HANDOFF_ERRORS = Object.freeze({
  TEMPLATE_INVALID: 'template-invalid',
  FACTS_INVALID: 'facts-invalid',
  SECTION_MISSING: 'section-missing',
  DOCUMENT_EMPTY: 'document-empty',
})

/** 组装失败的统一错误：`code` 是稳定判据，消息面向人。 */
export class HandoffError extends Error {
  constructor(code, message) {
    super(message)
    this.name = 'HandoffError'
    this.code = code
  }
}

const isPlainObject = (value) => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const proto = Object.getPrototypeOf(value)
  return proto === Object.prototype || proto === null
}

/**
 * 把 facts 组装成交接文档文本。
 * @param {Record<string, string>} facts 节名 → 节文本（值必须是字符串）
 * @param {{ template: string }} options 模板文本
 * @returns {string}
 */
export function assembleHandoffDocument(facts, { template } = {}) {
  if (typeof template !== 'string' || template.trim() === '') {
    throw new HandoffError(
      HANDOFF_ERRORS.TEMPLATE_INVALID,
      `template must be a non-empty string (got ${template === null ? 'null' : typeof template})`,
    )
  }
  if (!isPlainObject(facts)) {
    throw new HandoffError(
      HANDOFF_ERRORS.FACTS_INVALID,
      `facts must be a plain object of sectionName -> text (got ${facts === null ? 'null' : Array.isArray(facts) ? 'array' : typeof facts})`,
    )
  }

  // 单遍扫描：每个 `{{…}}` 都必须解析成 facts 里的一个字符串。
  let out = ''
  let cursor = 0
  for (;;) {
    const open = template.indexOf('{{', cursor)
    if (open === -1) {
      out += template.slice(cursor)
      break
    }
    const close = template.indexOf('}}', open + 2)
    if (close === -1) {
      throw new HandoffError(
        HANDOFF_ERRORS.TEMPLATE_INVALID,
        `unclosed "{{" at index ${open} in template`,
      )
    }
    const raw = template.slice(open + 2, close)
    const key = raw.trim()
    if (key === '' || /\s/.test(key) || key.includes('{') || key.includes('}')) {
      throw new HandoffError(
        HANDOFF_ERRORS.TEMPLATE_INVALID,
        `malformed template token "{{${raw}}}" at index ${open} — section names must not be empty or contain whitespace/braces`,
      )
    }
    if (!Object.hasOwn(facts, key)) {
      throw new HandoffError(
        HANDOFF_ERRORS.SECTION_MISSING,
        `template references section "${key}" but facts does not provide it (provided: ${Object.keys(facts).join(', ') || 'none'})`,
      )
    }
    const value = facts[key]
    if (typeof value !== 'string') {
      throw new HandoffError(
        HANDOFF_ERRORS.FACTS_INVALID,
        `facts section "${key}" must be a string (got ${value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value})`,
      )
    }
    out += template.slice(cursor, open) + value
    cursor = close + 2
  }

  if (out.trim() === '') {
    throw new HandoffError(
      HANDOFF_ERRORS.DOCUMENT_EMPTY,
      'assembled handoff document is empty after substitution (template and every referenced section are blank)',
    )
  }
  return out
}
