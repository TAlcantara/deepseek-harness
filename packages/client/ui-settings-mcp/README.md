---
description: "MCP settings page for the dsh web client: the server roster, its add/edit form, the connectivity test, and the states a locked deployment renders."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-settings-mcp

English | [中文](README.zh.md)

## Summary

Open the **MCP** section in Settings to list this deployment's external MCP servers, add one, edit it, enable or disable it, remove it, and test whether it can be reached. Every write goes through the `mcpServers` Remote namespace, so the page holds no configuration of its own: it sends what the user typed and renders the complete roster the Host answers with. A server's namespace is fixed once added, because it decides the model-facing tool names. Secrets are write-only, and a connectivity test can run before anything is saved.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

Mount this plugin in a client composition that already provides the settings shell, the locale seats, and the generated Remote assembly. It contributes one `settings.section` entry named `mcp`, ordered between Models and Plugins.

The page reads and writes through six Remote methods: `list`, `add`, `update`, `remove`, `setEnabled`, and `testConnection`. Each write presents the revision it read, so a configuration that moved underneath the form reports a conflict instead of overwriting it, and each write answers with the complete roster the page then renders.

### What the user sees

| Control | Behavior |
|---|---|
| Add server | Opens a blank form: namespace, display name, transport, the transport's own fields, and the timeout |
| Row test | Tests the saved server, filling the values the page never received from the stored entry |
| Enable switch | Mounts or unmounts the server without discarding its configuration |
| Edit | Reopens the form with the stored values; the namespace is read-only |
| Remove | Asks for confirmation, then removes the server and its tools |
| Retry | Re-reads the roster after a failed load |

A deployment that reports `canEdit: false` renders the roster read-only: the add, edit, remove, and enable controls disappear, while the connectivity test stays available.

### Secrets

The Host never sends a secret value to the page, so the form cannot show one. Stored variables appear by name with a checkbox that marks them for removal, and the two textareas add new `NAME=value` lines. Leaving a stored variable alone means the write carries no operation for it, which is what keeps the value.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

- **One store, one face.** The page state lives in a snapshot store created at registration and published through the inject face's `hooks` compartment; the renderer binds it to `useSnapshot`, and the section renders from that hook alone.
- **Operations own the wire.** `operations.ts` is the single place that calls the Remote namespace, folds each answer into the store, and turns a failure code into localized copy. Components receive callbacks, never a context.
- **The form builds values, not requests.** `buildDraft` and `buildPatch` are pure functions over the form state; the edit patch carries variable-level secret operations so removals and additions are explicit.
- **Editor transitions are store state.** Opening, closing, the post-write notice, and the removal confirmation all live in the snapshot, so a re-render never loses a draft.

</details>

-----

<a id="model-experience"></a>
## Model Experience

None, as the page only configures servers; [`dsh-mcp-servers`](../../mcp/mcp-servers/README.md) mounts them and [`dsh-mcp-client`](../../mcp/mcp-client/README.md) owns the model-visible tool names, schemas, and results.

#### KV Cache effect

The page writes configuration and never request content: the tool definitions a save produces are the ones the Host mounts, so this package invalidates nothing on its own.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- **No live connection state** — the page reports the last connectivity test, not whether a mounted server is currently connected; a server that drops stays listed until a test or a reload says otherwise.
- **No rename** — changing a namespace is remove-and-re-add by design, so the form offers no rename path.
- **Servers mounted from `cordis.yml` are absent** — a deployment that also composes servers as configuration rows has two places to look, and this page shows only the roster it manages.
- **A saved server is not a tested one** — saving never tests, and the page says so rather than implying the server is reachable.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

- Importing another client's configuration (a pasted JSON block turned into rows) is an open direction.
- Whether the page should show a deployment-composed entry as read-only, rather than omitting it, is open; the Host would need to mark each entry's origin.

</details>
