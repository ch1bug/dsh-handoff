/**
 * verify-all 的纯判定面（runner 的 IO 壳只负责读文件 / 起进程）。
 * 把这些判据抽成纯函数，是为了它们能被用例覆盖（`@needs-runtime` 的 SKIP 分支、
 * PASS* 口径），而不是靠「跑一次碰巧看到」。
 */

/** 不是用例的共享挂具（runner 会跳过，不当作用例）。 */
export const NOT_A_TEST = new Set(['harness.mjs'])

/** 从目录条目里挑出用例文件（排序稳定）。 */
export function testFiles(names) {
  return names
    .filter((name) => name.endsWith('.mjs') && !NOT_A_TEST.has(name))
    .sort()
}

/** 头部注释区里声明了 @needs-runtime 的用例需要运行时锚。 */
export function needsRuntime(header) {
  return /(^|\s)@needs-runtime\b/m.test(header)
}

/**
 * 决定每个用例这次怎么跑。
 * @param {string[]} files
 * @param {Map<string, string>} headers 文件名 → 头部注释区
 * @param {boolean} anchorExists tests/node_modules/@deepseek-ai 是否存在
 * @returns {{file: string, action: 'run'|'skip', reason?: string}[]}
 */
export function planFor(files, headers, anchorExists) {
  return files.map((file) => {
    if (needsRuntime(headers.get(file) ?? '') && !anchorExists) {
      return {
        file,
        action: 'skip',
        reason: 'needs runtime anchor (tests/node_modules/@deepseek-ai) —— 先接线再跑，不冒充通过',
      }
    }
    return { file, action: 'run' }
  })
}

/** 用例自报的响亮跳过行（`SKIP (loud): …`）——与消费方仓 PASS* 口径一致。 */
export function loudSkips(stdout) {
  return String(stdout ?? '')
    .split(/\r?\n/)
    .filter((line) => /^SKIP \(loud\)/.test(line))
}

/** 用例结果口径：FAIL / PASS*（含 loud skip）/ PASS。 */
export function statusOf({ exitCode, stdout }) {
  if (exitCode !== 0) return 'FAIL'
  return loudSkips(stdout).length > 0 ? 'PASS*' : 'PASS'
}
