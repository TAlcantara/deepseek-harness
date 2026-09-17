/**
 * The section's shared vocabulary: the inject face the renderer spreads into
 * the MCP settings section, and the translate seat it renders copy through.
 *
 * @module
 */

import type { SnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { McpTranslate } from './locales.ts'
import type { McpServersOperations } from './operations.ts'
import type { McpServersState } from './store.ts'

/** Values the registering plugin hands the MCP settings section. */
export interface McpSectionInjected {
  /** Load, writes, connectivity tests, and editor transitions. */
  operations: McpServersOperations
  /** Bare observables the renderer binds to `useSnapshot`. */
  hooks: {
    /** The page snapshot. */
    snapshot: SnapshotStore<McpServersState>
  }
  /** The bound translate seat for this page's copy. */
  t: McpTranslate
}
