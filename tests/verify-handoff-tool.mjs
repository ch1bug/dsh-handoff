/**
 * S2 缝：薄 tool 适配器（`handoff_tool`）——模型面。
 * 判据（行为，不看实现）：
 *   - text 模式 / path 模式各自组装成功；
 *   - path 与 text 同时给 → template-source-ambiguous；都不给 → template-source-missing
 *     （**没有**隐式默认：插件 config 不能绕过二选一契约）；
 *   - 路径不存在 → template-missing（点名路径）；非 UTF-8 → template-encoding；
 *   - 库的失败面透传（fact 非字符串 → facts-invalid；未知节 → section-missing）；
 *   - 注册形状：名字 handoff_tool、parameters 声明 facts、render 产出 text block。
 */
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { apply, TOOL_NAME, TOOL_ERRORS } from '../handoff-tool.mjs'
import { HANDOFF_ERRORS, HandoffError } from '../lib/handoff-document.mjs'
import { makeReporter } from './harness.mjs'

const { check, throwsWith, finish } = makeReporter('handoff-tool')

const mount = (config) => {
  let definition
  const ctx = { tools: { register: (def) => { definition = def } } }
  apply(ctx, config)
  if (definition === undefined) throw new Error('plugin did not register a tool')
  return definition
}

const root = await mkdtemp(join(tmpdir(), 'dsh-handoff-tool-'))
const templatePath = join(root, 'handoff-template.md')
await writeFile(templatePath, '## 边界\n\n{{boundary}}\n', 'utf8')
const badPath = join(root, 'bad-utf8.md')
await writeFile(badPath, Buffer.from([0xff, 0xfe, 0x00, 0x80]))

const tool = mount()

// T1 — text 模式
const t1 = await tool.execute({ facts: { boundary: 'B' }, templateText: '{{boundary}}' })
check('T1 text 模式组装', t1?.text === 'B', JSON.stringify(t1))

// T2 — path 模式（真读文件）
const t2 = await tool.execute({ facts: { boundary: '边界正文' }, templatePath })
check('T2 path 模式组装', t2?.text === '## 边界\n\n边界正文\n', JSON.stringify(t2))

// T3 — 两者同时给 → 响亮
await throwsWith('T3 path+text 同时给 → template-source-ambiguous', () => tool.execute({ facts: {}, templateText: 'x', templatePath }), HandoffError, TOOL_ERRORS.SOURCE_AMBIGUOUS)

// T4 — 都不给 → 响亮（config 也不能兜底）
await throwsWith('T4 都不给 → template-source-missing', () => tool.execute({ facts: {} }), HandoffError, TOOL_ERRORS.SOURCE_MISSING)
const mountedWithConfig = mount({ templatePath })
await throwsWith(
  'T4b 插件 config 不提供隐式模板源（二选一契约不可绕过）',
  () => mountedWithConfig.execute({ facts: {} }),
  HandoffError,
  TOOL_ERRORS.SOURCE_MISSING,
)

// T5 — 路径不存在 → 点名路径
await throwsWith('T5 路径不存在 → template-missing', () => tool.execute({ facts: {}, templatePath: join(root, 'nope.md') }), HandoffError, TOOL_ERRORS.FILE_MISSING)

// T6 — 非 UTF-8 → template-encoding
await throwsWith('T6 非 UTF-8 → template-encoding', () => tool.execute({ facts: {}, templatePath: badPath }), HandoffError, TOOL_ERRORS.FILE_ENCODING)

// T7 — 库失败面透传
await throwsWith(
  'T7 fact 非字符串 → facts-invalid 透传',
  () => tool.execute({ facts: { boundary: 42 }, templateText: '{{boundary}}' }),
  HandoffError,
  HANDOFF_ERRORS.FACTS_INVALID,
  'boundary',
)
await throwsWith(
  'T7b 未知节 → section-missing 透传',
  () => tool.execute({ facts: {}, templateText: '{{missing}}' }),
  HandoffError,
  HANDOFF_ERRORS.SECTION_MISSING,
  'missing',
)

// T8 — 注册形状
check('T8 tool 名 handoff_tool', tool.name === TOOL_NAME && TOOL_NAME === 'handoff_tool', tool.name)
check('T8 description 非空', typeof tool.description === 'string' && tool.description.length > 20)
check('T8 parameters 是对象且声明 facts', tool.parameters?.type === 'object' && tool.parameters?.properties?.facts !== undefined, JSON.stringify(tool.parameters))

// T9 — render 产出 text block
const rendered = tool.output.render({}, { text: 'R' })
check('T9 render 产出 text block', Array.isArray(rendered) && rendered[0]?.type === 'text' && rendered[0]?.text === 'R', JSON.stringify(rendered))

await rm(root, { recursive: true, force: true })
finish('HANDOFF-TOOL')
