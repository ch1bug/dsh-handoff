/**
 * tests/harness.mjs —— 两个用例共享的最小判据工具（runner 会把它从用例面排除）。
 * 只做断言与「抛错并校验 code」，不含任何被测语义。
 */
export function makeReporter(label) {
  let pass = 0
  let fail = 0
  const check = (name, cond, detail = '') => {
    if (cond) pass += 1
    else fail += 1
    console.log(`  ${cond ? '✓' : '✗'} ${name}${!cond && detail ? ` — ${detail}` : ''}`)
  }
  /** 断言 fn 以指定 HandoffError.code 抛出（同步或异步均可）。 */
  const throwsWith = async (name, fn, HandoffError, code, needle) => {
    try {
      await fn()
      check(name, false, 'no throw')
    } catch (error) {
      const ok =
        error instanceof HandoffError &&
        error.code === code &&
        (needle === undefined || String(error.message).includes(needle))
      check(name, ok, `code=${error?.code} message=${error?.message}`)
    }
  }
  const finish = (file) => {
    console.log(`\n=== ${file} ${fail === 0 ? 'PASS' : 'FAIL'} === ${pass} passed, ${fail} failed`)
    process.exit(fail === 0 ? 0 : 1)
  }
  return { check, throwsWith, finish }
}
