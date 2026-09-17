# MCP servers

[English](mcp.md) | 中文

MCP server 花名册——让部署或用户从设置界面配置外部 [Model Context Protocol](https://modelcontextprotocol.io) server、而不必编辑 `cordis.yml` 的子系统。[dsh-mcp-servers](../../packages/mcp/mcp-servers) 拥有花名册文档与 `ctx.mcpServers` 服务；每个启用的条目经由 [dsh-mcp-client](../../packages/mcp/mcp-client) 挂载，后者拥有桥接、命名与重连行为；[dsh-client-ui-settings-mcp](../../packages/client/ui-settings-mcp) 是渲染设置页面的 Consumer。

MCP 是**一个可选能力**，不属于 agent-loop 主干——因此它的词汇表在这里，而不在 [core.md](core.zh.md)。通过设置添加的 server 产出的模型可见工具名、schema 与结果，与手写一行 `dsh-mcp-client` 完全一致。

Source: [`packages/mcp/mcp-servers/src/index.ts`](../../packages/mcp/mcp-servers/src/index.ts)

## 花名册与设置

花名册是 `mcp` [settings](settings.zh.md) 命名空间中的一个文档。`Config.initialServers` 提供组合的 base 层，用户编辑通过每个 settings 命名空间都遵循的常规分层解析覆盖它。`Config.editable` 决定该部署是否接受写入；`Config.testTimeoutMs` 与 `Config.maxConcurrentTests` 约束下文的连通性测试。

每个条目携带 `id`、`serverName`、`enabled`、`label`、`transport`，`stdio` 字段（`command`、`args`、`cwd`、`env`）或 `streamable-http` 字段（`url`、`headers`），以及 `toolCallTimeoutMs`、`failOnStartupError` 和可选的 `reconnect` 策略。桥接选项的含义与 [dsh-mcp-client](../../packages/mcp/mcp-client/README.zh.md) 文档所述完全一致；本子系统只负责存储与透传。

写入先持久化，已挂载实例再从持久化文档收敛，因此该文档是唯一事实来源：没有存储条目在背后，任何东西都不会进入活动集合。revision 从 settings provider 的描述符读取而非本地计数，因此本服务与同一文档的任何其他编辑者收敛，而不是互相覆盖。

密钥值留在 Host 上。视图携带 `envKeys` 与 `headerKeys`——即已设置的名称而非值——因此界面可以围绕它从未收到的凭据进行渲染与编辑。

## Remote 接口

`ctx.remote.mcpServers` 把花名册暴露给配置界面：

| 方法 | 参数 | 结果 |
|---|---|---|
| `list` | — | `McpServerSnapshot` |
| `add` | `draft`、`expectedRevision` | `McpServerSnapshot` |
| `update` | `id`、`patch`、`expectedRevision` | `McpServerSnapshot` |
| `deleteServer` | `id`、`expectedRevision` | `McpServerSnapshot` |
| `setEnabled` | `id`、`enabled`、`expectedRevision` | `McpServerSnapshot` |
| `testConnection` | `target`、`signal` | `McpConnectionTest` |

每次写入都提交它读到的 `revision`，当花名册已越过该版本时被拒绝；每次写入都以完整花名册及其新 revision 应答，因此调用方永远不需要合并部分状态。

`update` 拒绝 `serverName`，因为该名称固定了模型可见的工具命名空间。它的 `env` 与 `headers` 是变量级补丁：字符串设置一个值，`null` 移除一个，缺键保留已存值——这正是持有脱敏视图的界面能够围绕它从未收到的密钥进行编辑的原因。

## 连通性测试

`testConnection` 连接到一个目标、列出其工具、然后关闭。它不注册任何东西也不预留命名空间，因此可以在草稿保存前测试它，也可以测试一个名称已被其他条目挂载的 server。传入某已保存条目的 id 作为 `basedOn`，会用该条目的已存值补齐草稿缺失的密钥，因此编辑表单无需重新输入凭据即可测试。

失败的测试是正常结果——`ok: false` 加上一段绝不含凭据值的摘要——而不是传输错误。已保存条目的结果在内存中记忆，Host 重启即清除。测试在覆盖连接、发现与关闭的单一总预算下运行；超过 `maxConcurrentTests` 的调用方排队而非失败，disposal 会中止进行中的测试并等待它们结束。

## 挂载与命名

收敛在单一 promise 链上运行，因此两次写入的卸载与挂载步骤绝不会交错。每一轮先卸载已离开花名册的条目，再把每个剩余条目的桥接配置与已挂载实例的比较：配置相同则不动——诸如 `label` 这类纯展示变更不会重启 server——配置变化则替换。

`serverName` 在整个注册作用域内唯一。命名空间已被其他注册占用的条目会让该次挂载失败并通过 `mountError` 上报，而不会拖垮 Host；该条目仍留在花名册中供运维修正。无法连通的 server 仍会挂载并自行重试。

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — the language sides differ only in locale-specific paired document paths. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.zh.md#dispatch-modes), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxmcpservers--mcpservers"></a>

### `ctx.mcpServers` — `McpServers`

MCP server roster: settings, reconciliation, and connectivity testing.

```ts cordis-catalog
/**
 * Every configured server with its current mounted state.
 * @returns The complete roster snapshot.
 */
@Remote('list') list(): Promise<McpServerSnapshot>

/**
 * Add one server. The Host assigns its id; `serverName` is fixed from here on.
 * @param draft - The new server's fields.
 * @param expectedRevision - Revision the caller read.
 * @returns The roster after the write.
 */
@Remote('add') async add(draft: McpServerDraft, expectedRevision: number): Promise<McpServerSnapshot>

/**
 * Edit one server. The model-facing namespace is immutable and rejected here.
 * @param id - Roster entry to edit.
 * @param patch - Fields and variable-level secret operations to apply.
 * @param expectedRevision - Revision the caller read.
 * @returns The roster after the write.
 */
@Remote('update') async update(id: string, patch: McpServerPatch, expectedRevision: number): Promise<McpServerSnapshot>

/**
 * Remove one server and release its namespace.
 * @param id - Roster entry to remove.
 * @param expectedRevision - Revision the caller read.
 * @returns The roster after the write.
 */
@Remote('deleteServer') async deleteServer(id: string, expectedRevision: number): Promise<McpServerSnapshot>

/**
 * Enable or disable one server without discarding its configuration.
 * @param id - Roster entry to toggle.
 * @param enabled - Whether the entry should mount.
 * @param expectedRevision - Revision the caller read.
 * @returns The roster after the write.
 */
@Remote('setEnabled') setEnabled(id: string, enabled: boolean, expectedRevision: number): Promise<McpServerSnapshot>

/**
 * Test one server's connectivity without mounting it.
 *
 * A draft may be tested before it is saved; when it derives from a saved
 * entry, that entry's stored secret values fill the draft's missing keys.
 *
 * @param target - The form contents and the saved entry they derive from.
 * @param signal - Caller cancellation, injected by the Gateway.
 * @returns The test outcome; a failed server is reported, not thrown.
 */
@Remote('testConnection') async testConnection(target: McpTestTarget, signal: AbortSignal): Promise<McpConnectionTest>
```

Source: [`packages/mcp/mcp-servers/src/index.ts`](../../packages/mcp/mcp-servers/src/index.ts)
<!-- END GENERATED cordis-surface -->
