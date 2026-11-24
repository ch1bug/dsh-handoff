/**
 * S3 缝：仓级跑法（`scripts/verify-all.mjs`）的**纯判定面**。
 * 判据：文件枚举排除挂具；@needs-runtime 在锚缺席时 SKIP 且给补救话术；
 * 锚在场时照跑；PASS* 口径（自报 loud skip 不被记成普通 PASS）。
 */
import { testFiles, needsRuntime, planFor, loudSkips, statusOf, NOT_A_TEST } from '../scripts/verify-all-lib.mjs'
import { makeReporter } from './harness.mjs'

const { check, finish } = makeReporter('runner')

check('R1 枚举排除共享挂具', testFiles(['a.mjs', 'harness.mjs', 'notes.md', 'b.mjs']).join(',') === 'a.mjs,b.mjs')
check('R1b NOT_A_TEST 至少含 harness.mjs', NOT_A_TEST.has('harness.mjs'))

check('R2 @needs-runtime 标记识别', needsRuntime('// @needs-runtime\nimport x') && !needsRuntime('// plain header'))

const headers = new Map([
  ['runtime-test.mjs', '// @needs-runtime\n'],
  ['pure-test.mjs', '// plain\n'],
])
const skipped = planFor(['runtime-test.mjs', 'pure-test.mjs'], headers, false)
check(
  'R3 锚缺席：runtime 用例 SKIP 且给补救话术',
  skipped[0].action === 'skip' && /runtime anchor/.test(skipped[0].reason) && skipped[1].action === 'run',
  JSON.stringify(skipped),
)
const run = planFor(['runtime-test.mjs'], headers, true)
check('R3b 锚在场：runtime 用例照跑', run[0].action === 'run', JSON.stringify(run))

check('R4 loud skip 提取', loudSkips('ok\nSKIP (loud): needs runtime\nmore').join('|') === 'SKIP (loud): needs runtime')
check('R5 普通 PASS 口径', statusOf({ exitCode: 0, stdout: 'all good' }) === 'PASS')
check('R5b 含 loud skip → PASS*（不冒充普通通过）', statusOf({ exitCode: 0, stdout: 'SKIP (loud): x' }) === 'PASS*')
check('R5c 非零退出 → FAIL', statusOf({ exitCode: 1, stdout: 'SKIP (loud): x' }) === 'FAIL')

finish('RUNNER')
