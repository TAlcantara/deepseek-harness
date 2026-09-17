/**
 * Wire operations behind the MCP settings page: one place that calls the
 * `mcpServers` Remote namespace, folds its answers into the page store, and
 * localizes its failures.
 *
 * @module
 */

import type { ClientRemote, RemoteFailure } from '@deepseek-ai/dsh-api-remotes/client'
import type { SnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { McpServerDraft, McpServerPatch, McpServerSnapshot, McpTestTarget } from '@deepseek-ai/dsh-mcp-servers/types'
import type { McpTranslate } from './locales.ts'
import { DRAFT_KEY, type McpServersState, type McpTestState } from './store.ts'

/** The complete mutation and load surface the section receives. */
export interface McpServersOperations {
  /** Load the roster when the page has not loaded it yet. */
  load(): Promise<void>
  /** Re-read the roster regardless of the current status. */
  reload(): Promise<void>
  /** Add one server; resolves true when the write landed. */
  add(draft: McpServerDraft): Promise<boolean>
  /** Edit one server; resolves true when the write landed. */
  update(id: string, patch: McpServerPatch): Promise<boolean>
  /** Remove one server. */
  remove(id: string): Promise<void>
  /** Enable or disable one server. */
  setEnabled(id: string, enabled: boolean): Promise<void>
  /** Test one target, recording the outcome under `key`. */
  test(target: McpTestTarget, key: string): Promise<void>
  /** Open the blank editor. */
  openAdd(): void
  /** Open the editor on one saved server. */
  openEdit(id: string): void
  /** Close the editor and forget its draft. */
  closeEditor(): void
  /** Ask for confirmation before removing one server. */
  askRemove(id: string): void
  /** Dismiss the removal confirmation. */
  cancelRemove(): void
  /** Dismiss the post-write notice. */
  dismissNotice(): void
}

/** The test states without one key. */
function withoutTest(tests: Record<string, McpTestState>, key: string): Record<string, McpTestState> {
  return Object.fromEntries(Object.entries(tests).filter(([name]) => name !== key))
}

/**
 * Create the page operations.
 * @param remote - The generated `mcpServers` Remote namespace.
 * @param store - The page store.
 * @param t - The bound translate seat.
 * @returns The operations the section and its editor call.
 */
export function createMcpServersOperations(
  remote: ClientRemote['mcpServers'],
  store: SnapshotStore<McpServersState>,
  t: McpTranslate,
): McpServersOperations {
  /** Fold the Host's complete roster answer into the page. */
  const applySnapshot = (snapshot: McpServerSnapshot): void => {
    store.update((draft) => {
      draft.status = 'ready'
      draft.loadError = ''
      draft.servers = snapshot.servers
      draft.revision = snapshot.revision
      draft.capabilities = snapshot.capabilities
    })
  }

  /** Record a test state for one key. */
  const setTest = (key: string, state: McpTestState): void => {
    store.update((draft) => { draft.tests[key] = state })
  }

  /** Turn one Remote failure into page copy. */
  const describeFailure = (error: RemoteFailure): string => {
    switch (error.code) {
      case 'mcp/stale-revision': return t('error.staleRevision')
      case 'mcp/not-editable': return t('error.notEditable')
      case 'mcp/duplicate-server-name': return t('error.duplicateServerName', { name: error.details.serverName })
      case 'mcp/invalid-entry': return t('error.invalidEntry', { field: error.details.field, reason: error.details.reason })
      case 'mcp/unknown-server': return t('error.unknownServer')
      default: return t('error.generic', { message: error.message })
    }
  }

  /** Guard a write: clear messages, send it, and fold either outcome. */
  const write = async (
    send: () => Promise<{ ok: true; value: McpServerSnapshot } | { ok: false; error: RemoteFailure }>,
  ): Promise<boolean> => {
    store.update((draft) => { draft.writeError = ''; draft.notice = '' })
    const answer = await send()
    if (!answer.ok) {
      store.update((draft) => { draft.writeError = describeFailure(answer.error) })
      return false
    }
    applySnapshot(answer.value)
    store.update((draft) => {
      draft.writeError = ''
      draft.notice = t('save.saved')
    })
    return true
  }

  /** Re-read the roster and fold the answer. */
  const reload = async (): Promise<void> => {
    store.update((draft) => { draft.status = 'loading'; draft.loadError = '' })
    const answer = await remote.list()
    if (!answer.ok) {
      store.update((draft) => { draft.status = 'failed'; draft.loadError = describeFailure(answer.error) })
      return
    }
    applySnapshot(answer.value)
  }

  return {
    async load(): Promise<void> {
      if (store.getSnapshot().status !== 'idle') return
      await reload()
    },

    reload,

    async add(draft: McpServerDraft): Promise<boolean> {
      const revision = store.getSnapshot().revision
      return await write(async () => await remote.add(draft, revision))
    },

    async update(id: string, patch: McpServerPatch): Promise<boolean> {
      const revision = store.getSnapshot().revision
      return await write(async () => await remote.update(id, patch, revision))
    },

    async remove(id: string): Promise<void> {
      const revision = store.getSnapshot().revision
      const written = await write(async () => await remote.deleteServer(id, revision))
      if (written) store.update((draft) => { draft.pendingRemove = '' })
      // The Host drops the entry's cached test result with it, so the page
      // drops its own copy of the same fact.
      store.update((draft) => { draft.tests = withoutTest(draft.tests, id) })
    },

    async setEnabled(id: string, enabled: boolean): Promise<void> {
      await write(async () => await remote.setEnabled(id, enabled, store.getSnapshot().revision))
    },

    async test(target: McpTestTarget, key: string): Promise<void> {
      setTest(key, { phase: 'running' })
      const answer = await remote.testConnection(target)
      if (!answer.ok) {
        setTest(key, { phase: 'done', result: { ok: false, tools: [], error: describeFailure(answer.error), at: Date.now(), durationMs: 0 } })
        return
      }
      setTest(key, { phase: 'done', result: answer.value })
    },

    openAdd(): void {
      store.update((draft) => { draft.editor = { mode: 'add' }; draft.writeError = '' })
    },

    openEdit(id: string): void {
      store.update((draft) => { draft.editor = { mode: 'edit', id }; draft.writeError = '' })
    },

    closeEditor(): void {
      store.update((draft) => {
        draft.editor = { mode: 'closed' }
        draft.writeError = ''
        draft.tests = withoutTest(draft.tests, DRAFT_KEY)
      })
    },

    askRemove(id: string): void {
      store.update((draft) => { draft.pendingRemove = id })
    },

    cancelRemove(): void {
      store.update((draft) => { draft.pendingRemove = '' })
    },

    dismissNotice(): void {
      store.update((draft) => { draft.notice = '' })
    },
  }
}
