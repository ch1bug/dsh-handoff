/**
 * AC3 守卫：核心库必须**保持纯函数 / 零项目语义**。
 * 这条是结构守卫（静态读源码），因为「没有 IO / 没有项目语义」是**缺席断言**，行为测试抓不到：
 * 往库里加一个 readFileSync 或 `.scratch` 判断，行为用例照样全绿。
 *
 * 判据：
 *   P1 库源码不含任何 import / require（无依赖、无 IO 入口）；
 *   P2 库源码不出现 IO / 非确定性符号（process / Date / Math.random / fs / readFile …）；
 *   P3 库源码不出现消费方语义词（batch-state / .scratch / ask-matt / workflow / dsh-matt-preset）；
 *   P4 库对外导出恰为 assembleHandoffDocument / HandoffError / HANDOFF_ERRORS（不多不少）。
 */
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { makeReporter } from './harness.mjs'

const { check, finish } = makeReporter('handoff-purity')
const REPO = fileURLToPath(new URL('..', import.meta.url))
const source = await readFile(join(REPO, 'lib', 'handoff-document.mjs'), 'utf8')

check('P1 无 import / require（纯函数核心无依赖）', !/^\s*import\s/m.test(source) && !/\brequire\s*\(/.test(source))

const ioTokens = ['process.', 'new Date', 'Date.now', 'Math.random', 'node:fs', 'readFile', 'writeFile', 'fetch(']
const hitIo = ioTokens.filter((token) => source.includes(token))
check('P2 无 IO / 非确定性符号', hitIo.length === 0, hitIo.join(', '))

const policyTokens = ['batch-state', '.scratch', 'ask-matt', 'workflow', 'dsh-matt-preset']
const hitPolicy = policyTokens.filter((token) => source.toLowerCase().includes(token.toLowerCase()))
check('P3 无消费方语义词（能力不绑策略）', hitPolicy.length === 0, hitPolicy.join(', '))

const exported = [...source.matchAll(/^\s*export\s+(?:const|class|function)\s+([A-Za-z_$][\w$]*)/gm)].map((m) => m[1]).sort()
const expected = ['HANDOFF_ERRORS', 'HandoffError', 'assembleHandoffDocument']
check('P4 导出面恰为三个符号', JSON.stringify(exported) === JSON.stringify(expected), JSON.stringify(exported))

finish('HANDOFF-PURITY')
