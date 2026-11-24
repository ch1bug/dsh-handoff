/**
 * S1 缝：assembleHandoffDocument(facts, { template })
 * 纯函数、无 IO。判据（行为，不看实现）：
 *   - 模板决定节的顺序与静态文本（facts = 节名 → 节文本）；
 *   - 模板引用了 facts 没有的节 → 响亮失败（code = section-missing，消息点名该节）；
 *   - facts 的文本**不被二次插值**（不是模板引擎递归）；
 *   - 坏模板（非字符串 / 空 / 全空白）→ 响亮失败（template-invalid）；
 *   - 组装结果全空白 → 响亮失败（document-empty）；
 *   - 静态模板（不含 token）允许。
 */
import { assembleHandoffDocument, HandoffError } from '../lib/handoff-document.mjs'

let pass = 0
let fail = 0
const check = (name, cond, detail = '') => {
  if (cond) pass += 1
  else fail += 1
  console.log(`  ${cond ? '✓' : '✗'} ${name}${detail && !cond ? ` — ${detail}` : ''}`)
}
const throwsWith = (name, fn, code, needle) => {
  try {
    fn()
    check(name, false, 'no throw')
  } catch (error) {
    const ok = error instanceof HandoffError && error.code === code && (needle === undefined || String(error.message).includes(needle))
    check(name, ok, `code=${error?.code} message=${error?.message}`)
  }
}

// T1 — 模板决定顺序与静态文本（期望值手写，独立于实现）
const t1 = assembleHandoffDocument(
  { alpha: 'A 正文', beta: 'B 正文' },
  { template: '## 甲\n\n{{alpha}}\n\n## 乙\n\n{{beta}}\n' },
)
check('T1 模板决定节的顺序与静态文本', t1 === '## 甲\n\nA 正文\n\n## 乙\n\nB 正文\n', JSON.stringify(t1))

// T2 — 模板引用未知节：响亮失败并点名
throwsWith(
  'T2 未知节 → section-missing 且点名',
  () => assembleHandoffDocument({ alpha: 'x' }, { template: '{{alpha}} {{gamma}}' }),
  'section-missing',
  'gamma',
)

// T3 — 事实文本不被二次插值（一次性替换，不递归）
const t3 = assembleHandoffDocument(
  { alpha: '{{beta}}', beta: 'SHOULD-NOT-APPEAR' },
  { template: '{{alpha}}' },
)
check('T3 事实文本不被二次插值', t3 === '{{beta}}', JSON.stringify(t3))

// T4 — 坏模板：非字符串 / 空 / 全空白
for (const bad of [undefined, null, '', '   \n\t ', 42]) {
  throwsWith(`T4 坏模板 ${JSON.stringify(bad)} → template-invalid`, () => assembleHandoffDocument({}, { template: bad }), 'template-invalid')
}

// T5 — facts 形状坏：非对象
for (const bad of [undefined, null, 'x', 42, []]) {
  throwsWith(`T5 坏 facts ${JSON.stringify(bad)} → facts-invalid`, () => assembleHandoffDocument(bad, { template: '# x' }), 'facts-invalid')
}

// T6 — 静态模板（无 token）允许
check('T6 静态模板允许', assembleHandoffDocument({}, { template: '# 固定文档\n' }) === '# 固定文档\n')

// T7 — 结果全空白 → document-empty
throwsWith('T7 空结果 → document-empty', () => assembleHandoffDocument({ alpha: '   ' }, { template: '{{alpha}}' }), 'document-empty')

// T8 — 未被模板引用的 facts 允许（模板决定必需节）
check(
  'T8 多余 facts 不报错（模板决定必需节）',
  assembleHandoffDocument({ alpha: 'A', unused: 'U' }, { template: '{{alpha}}' }) === 'A',
)

console.log(`\n=== HANDOFF-DOCUMENT ${fail === 0 ? 'PASS' : 'FAIL'} === ${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
