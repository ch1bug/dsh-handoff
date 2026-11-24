#!/usr/bin/env node
/**
 * verify-all.mjs —— 本仓唯一检查入口（消费方仓同口径：无 CI，本地套件即验收通道）。
 *
 * 行为：
 *   - 枚举 tests/*.mjs（排序），逐个以独立进程运行；
 *   - 头部声明 `@needs-runtime` 的用例在运行时锚缺席时**响亮 SKIP**（打印成因与补救命令），
 *     绝不冒充通过（D47：防线缺席必须响亮）；
 *   - 任一 FAIL → 退出码 1；全部 PASS/SKIP → 0。
 *
 * 用法：node scripts/verify-all.mjs
 */
import { readdirSync, readFileSync, existsSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const TESTS = join(REPO, 'tests')
const RUNTIME_ANCHOR = join(TESTS, 'node_modules', '@deepseek-ai')

/** 头部注释区（到第一行代码为止），与消费方仓同口径：只看文件头，正文里的词不算标记。 */
function headerRegion(file) {
  const lines = readFileSync(join(TESTS, file), 'utf8').replace(/^\uFEFF/, '').split(/\r?\n/)
  const head = []
  let inBlock = false
  for (const line of lines) {
    if (inBlock) {
      head.push(line)
      if (line.includes('*/')) inBlock = false
      continue
    }
    if (/^\s*$/.test(line) || /^#!/.test(line) || /^\s*\/\//.test(line)) {
      head.push(line)
      continue
    }
    if (/^\s*\/\*/.test(line)) {
      head.push(line)
      if (!line.includes('*/')) inBlock = true
      continue
    }
    break
  }
  return head.join('\n')
}

const files = readdirSync(TESTS)
  .filter((f) => f.endsWith('.mjs'))
  .sort()

const rows = []
for (const file of files) {
  const header = headerRegion(file)
  if (/@needs-runtime\b/.test(header) && !existsSync(RUNTIME_ANCHOR)) {
    rows.push({
      file,
      status: 'SKIP',
      detail: 'needs runtime anchor (tests/node_modules/@deepseek-ai) —— 先接线再跑，不冒充通过',
    })
    continue
  }
  const started = Date.now()
  const run = spawnSync(process.execPath, [join(TESTS, file)], { cwd: REPO, encoding: 'utf8', timeout: 300_000 })
  const ms = Date.now() - started
  const ok = run.status === 0
  rows.push({
    file,
    status: ok ? 'PASS' : 'FAIL',
    ms,
    detail: ok ? '' : `exit=${run.status}${run.signal ? ` signal=${run.signal}` : ''}`,
    output: ok ? '' : `${run.stdout ?? ''}${run.stderr ?? ''}`,
  })
}

let failed = 0
console.log('\n=== verify-all ===')
for (const row of rows) {
  const label = row.ms !== undefined ? `${row.ms}ms` : ''
  console.log(`  ${row.status.padEnd(4)} ${row.file.padEnd(40)} ${row.detail || label}`)
}
for (const row of rows.filter((r) => r.status === 'FAIL')) {
  failed += 1
  console.log(`\n--- ${row.file} ---\n${row.output.trimEnd()}`)
}

const passed = rows.filter((r) => r.status === 'PASS').length
const skipped = rows.filter((r) => r.status === 'SKIP').length
console.log(
  `\n${failed === 0 ? 'OK' : 'FAILED'} — ${passed}/${rows.length} 通过` +
    (skipped > 0 ? `（${skipped} 项 SKIP：环境侧断言未验证）` : ''),
)
process.exit(failed === 0 ? 0 : 1)
