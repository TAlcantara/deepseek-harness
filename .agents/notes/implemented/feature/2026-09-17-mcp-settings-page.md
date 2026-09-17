# Agent Note: MCP settings page — a settings-backed roster of external MCP servers

Status: implemented

English | [中文](2026-09-17-mcp-settings-page.zh.md)

## Problem

Attaching an external MCP server required either a `cordis.yml` row or an ACP `session/new` parameter. Neither is reachable from the Web GUI, so a user had to know the profile layout and write YAML, and the running Host had to reload. The settings surface had no MCP concept at all, and the bridge exposes no connection state a surface could display even if it had one.

## Decision

### Two packages over one existing seam

`@deepseek-ai/dsh-mcp-servers` (Host) owns a settings namespace, reconciles it into `dsh-mcp-client` instances, and answers connectivity tests over Typert Remote. `@deepseek-ai/dsh-client-ui-settings-mcp` (browser) contributes one `settings.section` entry. The bridge keeps its one-server-per-instance contract: the roster decides which identities mount, and `dsh-mcp-client` keeps owning naming, discovery, execution, and the stdio environment scrub. This mirrors the ACP bridge, which already mounts session-scoped instances the same way.

### The settings document is the source of truth

The roster lives in the `mcp` settings namespace. A write persists through the settings provider and returns; a watcher converges the mounted instances from the document. The service reads the revision from the provider descriptor instead of keeping a counter, so two editors converge or conflict rather than overwriting each other, and `initialServers` gives a deployment the base layer of that same namespace.

### A server's namespace is immutable

`serverName` decides the public tool names `mcp__<serverName>__<tool>` that session history and permission rules already record, so `update` rejects a change to it. The type system excludes the field from the edit patch and the service rejects it again at runtime; changing it means removing the server and adding it with the new name.

### The removal export is not named `remove`

The Client Remote namespace service owns an internal `remove(kind, method, token)`, so a wire method exported as `remove` fails the Client assembly with a namespace conflict. The export is `deleteServer`, matching the `deletePreset` precedent on the agent-preset roster.

### Connectivity is tested, not tracked

`dsh-mcp-client` gained one export, `probeConnection(config, options)`: connect, drain `tools/list`, close, with a caller-supplied total budget and a bounded close. It registers no tools and reserves no namespace, so a draft can be tested before it is saved and a mounted name can be tested without a collision. The page therefore reports the last test result instead of a live connection state; the bridge keeps no status surface.

### Secrets never cross the wire

The settings schema marks `env` and `headers` values as secret, so the page reads variable names and never values. Reading a redacted view is what shaped the edit contract: `update` takes variable-level operations where a string sets, `null` removes, and an absent key keeps the stored value. A test may name a saved entry (`basedOn`), and the Host fills the keys the draft does not carry from that entry.

### Failures are contained

A server that cannot be reached still mounts and retries, so one unusable entry never stops the roster from converging. Only an assembly conflict — a namespace another registration already holds — fails that entry, and it is reported per entry through `mountError` while the rest keep working.

## Alternatives considered

- **Live status from the bridge.** Rejected: the surface would have to model reconnection states an operator cannot act on, and the actionable question — does this configuration work — is answered by a test.
- **Reusing the ACP per-session mount.** Rejected: the Web roster is deployment-level, not session-level.
- **A page under Plugins as a tab.** Rejected: a server roster is not a plugin, and the navigation entry matches the operator's mental model.
- **Persisting test results.** Rejected: a stale "OK" is worse than "not tested", and the result is an observation, not configuration.
- **A dedicated roster file.** Rejected: it would duplicate the settings namespace's revision fencing, redaction, and external-edit hot reload.

## Testing

- `packages/mcp/mcp-client/tests/probe.spec.ts` — the probe against real child processes: success, spawn failure, timeout, caller cancellation, reuse of a mounted namespace, and no tool registration.
- `packages/mcp/mcp-servers/tests/` — roster validation, reconciliation against the real bridge (including the presentation-only no-remount path and a namespace conflict), the probe gateway, and the service's Remote surface over a real file-backed settings provider.
- `apps/cli/tests/mcp-servers-config.spec.ts` — the assembled composition through the real Cordis Loader.
- `packages/client/ui-settings-mcp/tests/` — the store, the wire operations, the registration, and the section's rendered states.

## Consequences

- Adding a server from the page changes the tool catalog exactly as a configuration row would; the model-visible contract stays with `dsh-mcp-client`.
- Servers mounted by `cordis.yml` rows stay outside the page, so a deployment mixing both sources has two places to look.
- The page cannot report live connection state; it reports the last test and says when it has none.
- Streamable HTTP targets remain unrestricted, so any URL a user enters becomes an outbound Host request.
- The `mcp` group now holds two packages, listed in its group README.
