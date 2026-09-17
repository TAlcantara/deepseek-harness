---
description: "Settings-backed MCP server roster for deployments: the mcpServers service that mounts each configured server through dsh-mcp-client, its Remote methods, and the connectivity test a configuration surface drives."
kind: "package-reference"
---

# @deepseek-ai/dsh-mcp-servers

English | [中文](README.zh.md)

## Summary

Add `dsh-mcp-servers` when users configure external MCP servers from a settings surface instead of editing `cordis.yml`. One settings namespace holds the roster, and each entry mounts as its own `dsh-mcp-client` instance, so the model sees the tool names, schemas, and results a hand-written row would produce. Writes persist first and the mounted instances converge from that document, which stays the single source of truth. A server's namespace is fixed when it is added, because it decides the model-facing tool names. The service also answers a bounded connectivity test on demand.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Further Exploration](#further-exploration)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

Mount the service in a Host composition that also provides `settings`:

```yaml
- id: mcp-servers
  name: '@deepseek-ai/dsh-mcp-servers'
  config:
    initialServers: []
    editable: true
    testTimeoutMs: 15000
    maxConcurrentTests: 2
```

| Field | Default | Meaning |
|---|---|---|
| `initialServers` | `[]` | The settings base layer: servers the deployment composes, which user edits override |
| `editable` | `true` | Whether this deployment accepts roster writes |
| `testTimeoutMs` | `15,000` | Total budget one connectivity test runs under |
| `maxConcurrentTests` | `2` | How many tests may run at once; further callers wait |

Each roster entry carries `id`, `serverName`, `enabled`, `label`, `transport`, the `stdio` fields (`command`, `args`, `cwd`, `env`) or the `streamable-http` fields (`url`, `headers`), `toolCallTimeoutMs`, `failOnStartupError`, and an optional `reconnect` policy. The first four bridge options mean exactly what [`dsh-mcp-client`](../mcp-client/README.md) documents them to mean; this package stores them and passes them through.

### The Remote surface

`ctx.remote.mcpServers` exposes the roster to a configuration surface:

| Method | Arguments | Result |
|---|---|---|
| `list` | — | `McpServerSnapshot` |
| `add` | `draft`, `expectedRevision` | `McpServerSnapshot` |
| `update` | `id`, `patch`, `expectedRevision` | `McpServerSnapshot` |
| `deleteServer` | `id`, `expectedRevision` | `McpServerSnapshot` |
| `setEnabled` | `id`, `enabled`, `expectedRevision` | `McpServerSnapshot` |
| `testConnection` | `target`, `signal` | `McpConnectionTest` |

Every write presents the `revision` it read and is refused when the roster has moved past it. Every write answers with the complete roster and the new revision, so a caller never merges partial state. `update` rejects a `serverName`, and its `env` and `headers` are variable-level patches: a string sets a value, `null` removes one, and an absent key keeps the stored value, so a surface holding a redacted view can edit around secrets it never received.

`serverName` uniqueness spans the whole registration scope, so an entry colliding with a `cordis.yml`-mounted bridge fails that mount and reports through `mountError` rather than taking the Host down.

### Testing a server

`testConnection` connects to the target once, lists its tools, and closes. It registers nothing and reserves no namespace, so it can test a draft before it is saved, or a server whose name is already mounted. Pass `basedOn` with a saved entry's id and the stored secret values fill the keys the draft does not carry, which is what lets an edit form test without re-entering credentials.

A failed test is a normal result: `ok: false` with a summary that never contains a credential value. Results for saved entries are remembered in memory, and a Host restart clears them.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

### Design philosophy

- **The document is the source of truth.** A write persists to the `mcp` settings namespace and returns; a watcher converges the mounted instances. Nothing mutates the live set without a persisted entry behind it.
- **One entry, one bridge instance.** Reconciliation diffs by roster id, so a configuration change unmounts the old instance before mounting the next. A presentation-only change such as `label` leaves the running instance alone.
- **Mount failures are contained.** A server that cannot be reached still mounts and retries on its own; only an assembly conflict (a namespace another registration already holds) fails that entry, and the entry stays in the roster so the operator can fix it.
- **Secrets stay on the Host.** Views carry `envKeys` and `headerKeys`, never values, and the connectivity test reports a failure summary with no credential content.
- **Testing is bounded.** Excess tests queue rather than fail, one total budget covers connect, discovery, and close, and disposal aborts in-flight tests and waits for them.

### Source map

| File | Role |
|---|---|
| [`src/index.ts`](src/index.ts) | Service: `Config`, settings registration, the Remote methods, and the view projection |
| [`src/settings.ts`](src/settings.ts) | Namespace, schema, reconnect normalization, and the translation into the bridge's configuration |
| [`src/validate.ts`](src/validate.ts) | Draft normalization, the variable-level secret patch, and roster rules |
| [`src/supervisor.ts`](src/supervisor.ts) | Serialized reconciliation from the roster to live bridge instances |
| [`src/probe.ts`](src/probe.ts) | Connectivity gateway: concurrency ceiling, cancellation, and per-entry results |
| — | No runtime invariant companion is published; the mounted set is derived from the settings document, and the service exposes no independent snapshot of it. |

### Reconciliation

One promise chain serializes every reconciliation, so two writes can never interleave their unmount and mount steps. Each pass computes the enabled entries, unmounts what left the roster, then compares each remaining entry's bridge configuration with the mounted instance's: an identical configuration is left alone, a changed one is replaced. Disposal marks the supervisor closed, drains the queue, and unmounts everything; work queued after that point is dropped.

### Revisions

The service reads the revision from the settings provider's descriptor rather than keeping its own counter, so a write converges with any other editor of the same document. A provider that is replaced or withdrawn while the service lives fails the next read instead of serving a stale revision.

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

- [`dsh-mcp-client`](../mcp-client/README.md) — the bridge this package mounts, and the naming, reconnect, and result contracts it owns.
- [Settings subsystem](../../../docs/subsystems/settings.md) — the namespace, revision, and user-layer model every write here follows.
- [MCP memory guide](../../../docs/user/guide/mcp-memory.md) — worked server configurations for the settings surface.
- [Generated configuration catalog](../../../docs/config-catalog.md#deepseek-aidsh-mcp-servers) — every accepted field and its source declaration.

-----

<a id="model-experience"></a>
## Model Experience

Indirectly, through [`dsh-mcp-client`](../mcp-client/README.md), which owns the mounted tools' names, schemas, descriptions, and result rendering.

#### KV Cache effect

Mounting or removing a server adds or drops the tool definitions that package documents, exactly as a hand-written configuration row would; an unchanged roster reproduces an unchanged request prefix.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- **Only roster-managed servers appear here** — a server mounted by a `cordis.yml` row is not listed, not editable, and not removable from a configuration surface, so a deployment mixing both sources has two places to look.
- **A saved server is not a reachable server** — saving does not test, and a bridge whose server is unreachable stays mounted while it retries, so a surface must offer the connectivity test to answer whether a configuration works.
- **Test results are process-local** — they are cleared by a Host restart and never written to the settings document, so a surface cannot report a historical result.
- **A namespace change means remove and re-add** — `serverName` is immutable because it decides the model-facing tool names, so the operation is two writes rather than one edit.
- **Streamable HTTP targets are not restricted** — any HTTP(S) URL a user enters becomes an outbound request from the Host process, which is outside the sandbox's fetch network policy.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

This Dev Note is working context for maintainers: open design questions and directions that are not decided. It is explicitly non-authoritative — shipped behavior, limits, and accepted rationale live in the sections above, the package code, and the linked Agent Notes.

- Per-session rosters are an open direction: the Agent Client Protocol already mounts session-scoped MCP servers, and this service currently owns one global roster.
- Restricting Streamable HTTP targets — a deployment allowlist, or loopback-only by default — is an open security decision.
- Whether a deployment-composed entry should be individually read-only is open; today `editable` is the whole-deployment switch.

</details>
