/**
 * MCP settings page state: the roster snapshot the section renders, the
 * in-flight test per entry, and the editor's own mode. Everything here is
 * page-local; the Host owns the configuration itself.
 *
 * @module
 */

import { createSnapshotStore, type SnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { McpCapabilities, McpConnectionTest, McpServerView } from '@deepseek-ai/dsh-mcp-servers/types'

/** One entry's connectivity-test state. */
export type McpTestState =
  | { phase: 'idle' }
  | { phase: 'running' }
  | { phase: 'done'; result: McpConnectionTest }

/** Which editor the page is showing. */
export type McpEditorState =
  | { mode: 'closed' }
  | { mode: 'add' }
  | { mode: 'edit'; id: string }

/** Everything the MCP settings section renders. */
export interface McpServersState {
  /** Page load state; `ready` is the only state that renders the roster. */
  status: 'idle' | 'loading' | 'ready' | 'failed'
  /** Localized load failure; empty unless `status` is `failed`. */
  loadError: string
  /** The roster, as the Host last reported it. */
  servers: McpServerView[]
  /** Revision the next write must present. */
  revision: number
  /** What this deployment permits. */
  capabilities: McpCapabilities
  /** Test state keyed by server id, or {@link DRAFT_KEY} for the editor's form. */
  tests: Record<string, McpTestState>
  /** Which editor is open. */
  editor: McpEditorState
  /** Localized write failure shown inside the editor; empty when none. */
  writeError: string
  /** Localized confirmation shown after a successful write; empty when none. */
  notice: string
  /** Server id awaiting removal confirmation; empty when none. */
  pendingRemove: string
}

/** Test-state key for the editor's unsaved form. */
export const DRAFT_KEY = '__draft__'

/** The capabilities reported before the first load answers. */
export const UNKNOWN_CAPABILITIES: McpCapabilities = Object.freeze({
  canEdit: false,
  testTimeoutMs: 15_000,
})

/**
 * Create the page's store.
 * @returns A store seeded with the pre-load state.
 */
export function createMcpServersStore(): SnapshotStore<McpServersState> {
  return createSnapshotStore<McpServersState>({
    status: 'idle',
    loadError: '',
    servers: [],
    revision: 0,
    capabilities: UNKNOWN_CAPABILITIES,
    tests: {},
    editor: { mode: 'closed' },
    writeError: '',
    notice: '',
    pendingRemove: '',
  })
}

/**
 * Read one entry's test state, defaulting to untested.
 * @param state - Current page state.
 * @param key - Server id or {@link DRAFT_KEY}.
 * @returns The recorded test state.
 */
export function testStateOf(state: McpServersState, key: string): McpTestState {
  return state.tests[key] ?? { phase: 'idle' }
}
