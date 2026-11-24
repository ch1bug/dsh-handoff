/**
 * S1 缝：assembleHandoffDocument(facts, { template })
 * 纯函数、无 IO。判据（行为，不看实现）：
 *   - 模板决定节的顺序与静态文本（facts = 节名 → 节文本）；
 *   - 模板引用了 facts 没有的节 → 响亮失败（section-missing，消息点名该节）；
 *   - 节名允许两侧空白与中文；形状坏的 `{{…}}`（未闭合 / 空 / 含空白或花括号）→ template-invalid；
 *   - fact 值不是字符串 → facts-invalid（不静默强转）；
 *   - facts 的文本**不被二次插值**（不是模板引擎递归）；
 *   - 坏模板（非字符串 / 空 / 全空白）→ template-invalid；结果全空白 → document-empty；
 *   - 静态模板（不含 token）允许；未被模板引用的 facts 允许。
 */
import { assembleHandoffDocument, HandoffError, HANDOFF_ERRORS } from '../lib/handoff-document.mjs'
import { makeReporter } from './harness.mjs'

const { check, throwsWith, finish } = makeReporter('handoff-document')
const E = HANDOFF_ERRORS

// T1 — 模板决定顺序与静态文本（期望值手写，独立于实现）
const t1 = assembleHandoffDocument(
  { alpha: 'A 正文', beta: 'B 正文' },
  { template: '## 甲\n\n{{alpha}}\n\n## 乙\n\n{{beta}}\n' },
)
check('T1 模板决定节的顺序与静态文本', t1 === '## 甲\n\nA 正文\n\n## 乙\n\nB 正文\n', JSON.stringify(t1))

// T2 — 模板引用未知节：响亮失败并点名
await throwsWith('T2 未知节 → section-missing 且点名', () => assembleHandoffDocument({ alpha: 'x' }, { template: '{{alpha}} {{gamma}}' }), HandoffError, E.SECTION_MISSING, 'gamma')

// T3 — 事实文本不被二次插值（一次性替换，不递归）
const t3 = assembleHandoffDocument({ alpha: '{{beta}}', beta: 'SHOULD-NOT-APPEAR' }, { template: '{{alpha}}' })
check('T3 事实文本不被二次插值', t3 === '{{beta}}', JSON.stringify(t3))

// T4 — 坏模板：非字符串 / 空 / 全空白
for (const bad of [undefined, null, '', '   \n\t ', 42]) {
  await throwsWith(`T4 坏模板 ${JSON.stringify(bad)} → template-invalid`, () => assembleHandoffDocument({}, { template: bad }), HandoffError, E.TEMPLATE_INVALID)
}

// T5 — facts 形状坏：非对象 / 数组 / 非 plain 对象
for (const bad of [undefined, null, 'x', 42, []]) {
  await throwsWith(`T5 坏 facts ${JSON.stringify(bad)} → facts-invalid`, () => assembleHandoffDocument(bad, { template: '# x' }), HandoffError, E.FACTS_INVALID)
}

// T5b — fact 值不是字符串 → facts-invalid（不静默强转）
for (const badValue of [null, 42, {}, ['x']]) {
  await throwsWith(
    `T5b fact 值 ${JSON.stringify(badValue)} → facts-invalid 且点名节`,
    () => assembleHandoffDocument({ alpha: badValue }, { template: '{{alpha}}' }),
    HandoffError,
    E.FACTS_INVALID,
    'alpha',
  )
}

// T6 — 静态模板（无 token）允许
check('T6 静态模板允许', assembleHandoffDocument({}, { template: '# 固定文档\n' }) === '# 固定文档\n')

// T7 — 结果全空白 → document-empty
await throwsWith('T7 空结果 → document-empty', () => assembleHandoffDocument({ alpha: '   ' }, { template: '{{alpha}}' }), HandoffError, E.DOCUMENT_EMPTY)

// T8 — 未被模板引用的 facts 允许（模板决定必需节）
check('T8 多余 facts 不报错（模板决定必需节）', assembleHandoffDocument({ alpha: 'A', unused: 'U' }, { template: '{{alpha}}' }) === 'A')

// T9 — 节名两侧空白允许
const t9 = assembleHandoffDocument({ boundary: 'B' }, { template: 'x{{ boundary }}y' })
check('T9 节名两侧空白允许', t9 === 'xBy', JSON.stringify(t9))

// T10 — 中文节名（spec 的五节都是中文名）
const t10 = assembleHandoffDocument({ 交接边界: '边界正文' }, { template: '## 边界\n{{交接边界}}' })
check('T10 中文节名可替换', t10 === '## 边界\n边界正文', JSON.stringify(t10))

// T11 — 形状坏的 token 一律响亮（不再静默落文）
for (const badTemplate of ['{{a b}}', '{{}}', '{{ unclosed', '{{a{{b}}']) {
  await throwsWith(`T11 坏 token ${JSON.stringify(badTemplate)} → template-invalid`, () => assembleHandoffDocument({}, { template: badTemplate }), HandoffError, E.TEMPLATE_INVALID)
}

// T11b — 空白包裹是合法 token，但缺节仍要响亮（section-missing，不静默落文）
await throwsWith(
  'T11b 空白包裹 + 缺节 → section-missing',
  () => assembleHandoffDocument({}, { template: '{{ boundary }}' }),
  HandoffError,
  E.SECTION_MISSING,
  'boundary',
)

finish('HANDOFF-DOCUMENT')
