/**
 * S2 缝：薄 tool 适配器（`handoff_tool`）——模型面。
 * 判据（行为，不看实现）：
 *   - text 模式 / path 模式各自组装成功；
 *   - path 与 text 同时给 → template-source-ambiguous（响亮）；
 *   - 都不给且无默认 → template-source-missing；
 *   - 路径不存在 → template-missing（点名路径）；非 UTF-8 → template-encoding；
 *   - 插件 config 的默认模板路径在 args 未给时生效，args 覆盖默认；
 *   - 注册形状：名字 handoff_tool、parameters 是对象、render 产出 text block。
 */
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { apply, name as pluginName } from '../handoff-tool.mjs'
import { HandoffError } from '../lib/handoff-document.mjs'

let pass = 0
let fail = 0
const check = (n, c, d = '') => {
  if (c) pass += 1
  else fail += 1
  console.log(`  ${c ? '✓' : '✗'} ${n}${!c && d ? ` — ${d}` : ''}`)
}
const throwsWith = (label, fn, code) => {
  try {
    const out = fn()
    if (out && typeof out.then === 'function') {
      return out.then(
        () => check(label, false, 'resolved without throwing'),
        (error) => check(label, error instanceof HandoffError && error.code === code, `code=${error?.code} message=${error?.message}`),
      )
    }
    check(label, false, 'no throw')
  } catch (error) {
    check(label, error instanceof HandoffError && error.code === code, `code=${error?.code} message=${error?.message}`)
  }
}

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
await throwsWith('T3 path+text 同时给 → template-source-ambiguous', () => tool.execute({ facts: {}, templateText: 'x', templatePath }), 'template-source-ambiguous')

// T4 — 都不给且无默认 → 响亮
await throwsWith('T4 都不给 → template-source-missing', () => tool.execute({ facts: {} }), 'template-source-missing')

// T5 — 路径不存在 → 点名路径
await throwsWith('T5 路径不存在 → template-missing', () => tool.execute({ facts: {}, templatePath: join(root, 'nope.md') }), 'template-missing')

// T6 — 非 UTF-8 → template-encoding
await throwsWith('T6 非 UTF-8 → template-encoding', () => tool.execute({ facts: {}, templatePath: badPath }), 'template-encoding')

// T7 — config 默认路径生效；args 覆盖默认
const withDefault = mount({ templatePath })
const t7 = await withDefault.execute({ facts: { boundary: '默认' } })
check('T7 config 默认模板路径生效', t7?.text === '## 边界\n\n默认\n', JSON.stringify(t7))
const t7b = await withDefault.execute({ facts: {}, templateText: '覆盖' })
check('T7b args 覆盖 config 默认', t7b?.text === '覆盖', JSON.stringify(t7b))

// T8 — 注册形状
check('T8 插件名', pluginName === 'handoff-tool', pluginName)
check('T8 tool 名 handoff_tool', tool.name === 'handoff_tool', tool.name)
check('T8 description 非空', typeof tool.description === 'string' && tool.description.length > 20)
check('T8 parameters 是对象且声明 facts', tool.parameters?.type === 'object' && tool.parameters?.properties?.facts !== undefined, JSON.stringify(tool.parameters))

// T9 — render 产出 text block
const rendered = tool.output.render({}, { text: 'R' })
check('T9 render 产出 text block', Array.isArray(rendered) && rendered[0]?.type === 'text' && rendered[0]?.text === 'R', JSON.stringify(rendered))

await rm(root, { recursive: true, force: true })
console.log(`\n=== HANDOFF-TOOL ${fail === 0 ? 'PASS' : 'FAIL'} === ${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
