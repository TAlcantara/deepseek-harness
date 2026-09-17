# MCP servers

English | [中文](mcp.zh.md)

The MCP server roster — the subsystem that lets a deployment or a user configure external [Model Context Protocol](https://modelcontextprotocol.io) servers from a settings surface instead of editing `cordis.yml`. [dsh-mcp-servers](../../packages/mcp/mcp-servers) owns the roster document and the `ctx.mcpServers` service; each enabled entry mounts through [dsh-mcp-client](../../packages/mcp/mcp-client), which owns the bridge, its naming, and its reconnect behavior; [dsh-client-ui-settings-mcp](../../packages/client/ui-settings-mcp) is the Consumer that renders the settings page.

MCP is **one optional capability**, not part of the agent-loop spine — so its vocabulary lives here, not in [core.md](core.md). A server added through settings produces the same model-facing tool names, schemas, and results as a hand-written `dsh-mcp-client` row.

Source: [`packages/mcp/mcp-servers/src/index.ts`](../../packages/mcp/mcp-servers/src/index.ts)

## Roster and settings

The roster is a document in the `mcp` [settings](settings.md) namespace. `Config.initialServers` supplies the composition's base layer, and a user edit overrides it through the ordinary layered resolution every settings namespace follows. `Config.editable` decides whether this deployment accepts writes at all; `Config.testTimeoutMs` and `Config.maxConcurrentTests` bound the connectivity test described below.

Each entry carries `id`, `serverName`, `enabled`, `label`, `transport`, the `stdio` fields (`command`, `args`, `cwd`, `env`) or the `streamable-http` fields (`url`, `headers`), `toolCallTimeoutMs`, `failOnStartupError`, and an optional `reconnect` policy. The bridge options mean exactly what [dsh-mcp-client](../../packages/mcp/mcp-client/README.md) documents; this subsystem stores them and passes them through.

Writes persist first and the mounted instances converge from the persisted document, so the document is the single source of truth: nothing reaches the live set without a stored entry behind it. The revision is read from the settings provider's descriptor rather than counted locally, so this service and any other editor of the same document converge instead of overwriting each other.

Secret values stay on the Host. A view carries `envKeys` and `headerKeys` — the names that are set, never the values — so a surface can render and edit around credentials it never receives.

## The Remote surface

`ctx.remote.mcpServers` exposes the roster to the configuration surface:

| Method | Arguments | Result |
|---|---|---|
| `list` | — | `McpServerSnapshot` |
| `add` | `draft`, `expectedRevision` | `McpServerSnapshot` |
| `update` | `id`, `patch`, `expectedRevision` | `McpServerSnapshot` |
| `deleteServer` | `id`, `expectedRevision` | `McpServerSnapshot` |
| `setEnabled` | `id`, `enabled`, `expectedRevision` | `McpServerSnapshot` |
| `testConnection` | `target`, `signal` | `McpConnectionTest` |

Every write presents the `revision` it read and is refused when the roster has moved past it, and every write answers with the complete roster and its new revision, so a caller never merges partial state.

`update` rejects a `serverName`, because the name fixes the model-facing tool namespace. Its `env` and `headers` are variable-level patches: a string sets a value, `null` removes one, and an absent key keeps the stored value — which is what lets a surface holding a redacted view edit around secrets it never received.

## Connectivity testing

`testConnection` connects to one target, lists its tools, and closes. It registers nothing and reserves no namespace, so it can test a draft before that draft is saved, or a server whose name another entry already mounts. Passing `basedOn` with a saved entry's id fills the draft's missing secret keys from that entry's stored values, so an edit form tests without re-entering credentials.

A failed test is a normal result — `ok: false` with a summary that never contains a credential value — not a transport error. Results for saved entries are remembered in memory, and a Host restart clears them. The test runs under one total budget covering connect, discovery, and close; callers beyond `maxConcurrentTests` queue rather than fail, and disposal aborts in-flight tests and waits for them.

## Mounting and naming

Reconciliation runs on one promise chain, so two writes can never interleave their unmount and mount steps. Each pass unmounts what left the roster, then compares each remaining entry's bridge configuration with the mounted instance's: an identical configuration is left alone — a presentation-only change such as `label` does not restart a server — and a changed one is replaced.

`serverName` is unique across the whole registration scope. An entry whose namespace another registration already holds fails that mount and reports through `mountError` rather than taking the Host down, and the entry stays in the roster so an operator can correct it. A server that cannot be reached still mounts and retries on its own.

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — the language sides differ only in locale-specific paired document paths. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.md#dispatch-modes), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

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
