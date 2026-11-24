#!/usr/bin/env node
/**
 * verify-all.mjs —— 本仓唯一检查入口（消费方仓同口径：无 CI，本地套件即验收通道）。
 *
 * IO 壳只做三件：读文件、起进程、打印；判定（枚举 / @needs-runtime / PASS*）在
 * scripts/verify-all-lib.mjs 的纯函数里，由 tests/verify-runner.mjs 覆盖。
 *
 * 口径：
 *   - PASS   = exit 0 且无自报跳过；
 *   - PASS*  = exit 0 但用例打印了 `SKIP (loud): …`（环境侧断言未验证，响亮标记）；
 *   - SKIP   = 声明 @needs-runtime 且运行时锚缺席（打印成因与补救话术）；
 *   - FAIL   = 非零退出；任一 FAIL → 本脚本退出 1。
 *
 * 用法：node scripts/verify-all.mjs
 */
import { readdirSync, readFileSync, existsSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { testFiles, planFor, statusOf, loudSkips } from './verify-all-lib.mjs'

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const TESTS = join(REPO, 'tests')
const RUNTIME_ANCHOR = join(TESTS, 'node_modules', '@deepseek-ai')

/** 头部注释区（到第一行代码为止）：只看文件头，正文里的词不算标记。 */
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

const files = testFiles(readdirSync(TESTS))
const headers = new Map(files.map((file) => [file, headerRegion(file)]))
const plan = planFor(files, headers, existsSync(RUNTIME_ANCHOR))

const rows = []
for (const step of plan) {
  if (step.action === 'skip') {
    rows.push({ file: step.file, status: 'SKIP', detail: step.reason })
    continue
  }
  const started = Date.now()
  const run = spawnSync(process.execPath, [join(TESTS, step.file)], {
    cwd: REPO,
    encoding: 'utf8',
    timeout: 300_000,
  })
  const stdout = `${run.stdout ?? ''}${run.stderr ?? ''}`
  const status = statusOf({ exitCode: run.status, stdout })
  rows.push({
    file: step.file,
    status,
    ms: Date.now() - started,
    detail: status === 'FAIL' ? `exit=${run.status}${run.signal ? ` signal=${run.signal}` : ''}` : '',
    output: status === 'FAIL' ? stdout : '',
    skips: loudSkips(stdout),
  })
}

console.log('\n=== verify-all ===')
for (const row of rows) {
  const detail = row.detail || (row.ms !== undefined ? `${row.ms}ms` : '')
  console.log(`  ${row.status.padEnd(5)} ${row.file.padEnd(34)} ${detail}`)
  for (const line of row.skips ?? []) console.log(`          ${line}`)
}
for (const row of rows.filter((r) => r.status === 'FAIL')) {
  console.log(`\n--- ${row.file} ---\n${row.output.trimEnd()}`)
}

const count = (status) => rows.filter((r) => r.status === status).length
const failed = count('FAIL')
const loud = count('PASS*')
const skipped = count('SKIP')
console.log(
  `\n${failed === 0 ? 'OK' : 'FAILED'} — ${count('PASS')} PASS` +
    (loud > 0 ? ` + ${loud} PASS*（含 loud skip）` : '') +
    ` / ${rows.length} 项` +
    (skipped > 0 ? `（${skipped} 项 SKIP：环境侧断言未验证）` : ''),
)
process.exit(failed === 0 ? 0 : 1)
