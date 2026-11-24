# dsh-handoff

DSH 的 **handoff 能力**：把「事实 + 模板文本」组装成交接文档，并执行一次交接
（起子会话 / 首 turn）。**策略不在这里** —— 什么时候交接、状态源是什么、模板长什么样、
必需哪些节，全部由**消费方项目**决定。

状态：pre-alpha —— **第一跳已实现**（核心库 + 薄 tool 适配器，`0.0.1`）；执行面（fresh/fork、
侧边栏、首 turn）属第二跳。

## 边界（能力 vs 策略）

| 归本仓 | 归消费方项目 |
| --- | --- |
| 交接文档组装（核心库，纯函数，接模板**文本**） | 模板内容、必需节、文案 |
| 薄 tool 适配器（接受 `path` / `text`，负责读文件与**响亮失败**） | 何时调用、用什么模板 |
| 起子会话：fresh / fork、侧边栏挂载、首 turn、首 prompt | 何时该交接（判据） |
| 执行失败的形态与错误面 | 状态源（如批次状态文件）与后继票解析 |

本仓**不认识**任何具体工作流：不读批次状态文件、不判「该不该交接」、不内置项目模板。

## 接口（第一跳已实现）

- **核心库**（纯函数，无 IO、无时钟）：
  `assembleHandoffDocument(facts, { template }) -> string`
  - `facts` = 平坦的「节名 → 节文本」映射；`template` 用 `{{节名}}` 引用节；
  - 模板决定哪些节必需、以什么顺序出现、周围静态文本；
  - 失败面（`HandoffError.code`）：`template-invalid` / `facts-invalid` /
    `section-missing`（模板引用了 facts 没有的节，消息点名）/ `document-empty`；
  - 事实文本**不做二次插值**（一次性替换，防注入）。
- **薄 tool**：模型面名字 `handoff_tool`；参数 `facts` + `templateText` 或
  `templatePath` **恰一个**（**没有隐式默认**：插件 config 也不提供模板源，避免绕过二选一契约）。
  失败面（`TOOL_ERRORS`）：`template-source-ambiguous` / `template-source-missing` /
  `template-missing`（点名路径）/ `template-encoding`（非 UTF-8）/ `template-unreadable`。
- **错误码单一事实源**：库侧 `HANDOFF_ERRORS`、适配器侧 `TOOL_ERRORS`，消费方与守卫从这里取，
  不在别处抄裸串。
- **运行时 peer 锚**：`peerDependencies: { "@deepseek-ai/cordis": "^4.1.0" }`（插件行挂进 cordis 宿主）。
- **执行面**（fresh/fork、侧边栏、首 turn）：**第二跳**，第一跳不提供。

`docs/`（含 ADR）**不进 npm 包**：`files` 白名单只含 `lib/`、根级 `*.mjs`、README 与 LICENSE。

详细决策见 `docs/adr/0001-handoff-capability.md`。

## 消费方

第一个消费者是 `dsh-matt-preset`（精确锁版本依赖本包）；它的批次判据与模板仍是
**它自己的**策略。迁移分两跳（先库、后 tool 行），由该仓的票跟踪。

## 缓存纪律

模板与策略只在**生成 handoff 时**读取，绝不进系统提示词；任何提醒走消息面追加。
这是消费方仓 #200 的实测结论（前缀缓存按请求前缀命中）。

## 开发

无 CI，本地套件即验收通道：`npm test`（= `node scripts/verify-all.mjs`）。
头部标了 `@needs-runtime` 的用例在运行时锚缺席时**响亮 SKIP**，不冒充通过。
