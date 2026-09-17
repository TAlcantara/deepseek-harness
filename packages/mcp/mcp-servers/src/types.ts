/**
 * Wire and settings vocabulary for one MCP server roster entry. Types only:
 * the browser half reads this module through `@deepseek-ai/dsh-mcp-servers/types`
 * and never takes a runtime dependency on the Host half.
 *
 * @module @deepseek-ai/dsh-mcp-servers/types
 */

/** Automatic reconnect policy for one mounted server. */
export interface McpReconnectConfig {
  /** Reconnect automatically after a lost connection. */
  enabled?: boolean
  /** First reconnect delay in milliseconds; doubles per consecutive failure. */
  initialDelayMs?: number
  /** Backoff ceiling in milliseconds. */
  maxDelayMs?: number
  /** Consecutive failed attempts per outage before giving up. */
  maxAttempts?: number
}

/** One persisted roster entry, as the settings document stores it. */
export interface McpServerEntry {
  /** Stable roster id assigned by the Host; the reconciliation key. */
  id: string
  /**
   * Model-facing tool namespace. Immutable after creation: it decides the
   * public tool names `mcp__<serverName>__<tool>` that session history and
   * permission rules already record.
   */
  serverName: string
  /** Whether the entry participates in mounting. */
  enabled: boolean
  /** Display name; presentation only. */
  label: string
  /** Which transport carries this server. */
  transport: 'stdio' | 'streamable-http'
  /** Executable used to start a stdio server. */
  command: string
  /** Arguments passed directly, without shell interpolation. */
  args: string[]
  /** Working directory for a stdio server. */
  cwd: string
  /** Extra stdio environment variables; values never cross the wire. */
  env: Record<string, string>
  /** Streamable HTTP endpoint. */
  url: string
  /** Extra HTTP request headers; values never cross the wire. */
  headers: Record<string, string>
  /** Per-tool-call timeout in milliseconds. */
  toolCallTimeoutMs: number
  /** Fail bridge activation when the initial connection or sync fails. */
  failOnStartupError: boolean
  /** Automatic reconnect policy; omission uses the bridge's defaults. */
  reconnect?: McpReconnectConfig
}

/** Every roster field except the Host-assigned id. */
export type McpServerFields = Omit<McpServerEntry, 'id'>

/** One new server as the page submits it, before the Host assigns an id. */
export interface McpServerDraft extends Partial<McpServerFields> {
  /** Model-facing namespace, fixed for the entry's life. */
  serverName: string
  /** Which transport carries this server. */
  transport: 'stdio' | 'streamable-http'
}

/**
 * One edit. `env` and `headers` are variable-level patches: a string sets the
 * value, `null` removes it, and an absent key keeps the stored value. The
 * page therefore never needs to hold a secret value to edit around it.
 */
export interface McpServerPatch {
  /** Whether the entry participates in mounting. */
  enabled?: boolean
  /** Display name; presentation only. */
  label?: string
  /** Which transport carries this server. */
  transport?: 'stdio' | 'streamable-http'
  /** Executable used to start a stdio server. */
  command?: string
  /** Arguments passed directly, without shell interpolation. */
  args?: string[]
  /** Working directory for a stdio server. */
  cwd?: string
  /** Variable-level environment patch. */
  env?: Record<string, string | null>
  /** Streamable HTTP endpoint. */
  url?: string
  /** Variable-level header patch. */
  headers?: Record<string, string | null>
  /** Per-tool-call timeout in milliseconds. */
  toolCallTimeoutMs?: number
  /** Fail bridge activation when the initial connection or sync fails. */
  failOnStartupError?: boolean
  /** Automatic reconnect policy. */
  reconnect?: McpReconnectConfig
}

/** One connectivity-test result. */
export interface McpConnectionTest {
  /** True only when the connection and the complete tool list succeeded. */
  ok: boolean
  /** The server's own tool names, without the `mcp__` prefix. */
  tools: string[]
  /** Failure summary; absent on success. Never contains credential values. */
  error?: string
  /** When the test started, in epoch milliseconds. */
  at: number
  /** End-to-end duration in milliseconds. */
  durationMs: number
}

/**
 * What one test targets: unsaved form contents, optionally based on a saved
 * entry whose stored secret values fill the draft's missing keys.
 */
export interface McpTestTarget {
  /** The form's current contents. */
  draft: McpServerDraft
  /** Saved entry the draft derives from, when it edits an existing server. */
  basedOn?: string
}

/** One server as the page reads it; never carries a secret value. */
export interface McpServerView {
  /** Stable roster id. */
  id: string
  /** Model-facing tool namespace. */
  serverName: string
  /** Whether the entry participates in mounting. */
  enabled: boolean
  /** Display name; presentation only. */
  label: string
  /** Which transport carries this server. */
  transport: 'stdio' | 'streamable-http'
  /** Executable used to start a stdio server. */
  command: string
  /** Arguments passed directly, without shell interpolation. */
  args: string[]
  /** Working directory for a stdio server. */
  cwd: string
  /** Names of the configured environment variables, sorted; values are withheld. */
  envKeys: string[]
  /** Streamable HTTP endpoint. */
  url: string
  /** Names of the configured request headers, sorted; values are withheld. */
  headerKeys: string[]
  /** Per-tool-call timeout in milliseconds. */
  toolCallTimeoutMs: number
  /** Fail bridge activation when the initial connection or sync fails. */
  failOnStartupError: boolean
  /** Automatic reconnect policy. */
  reconnect?: McpReconnectConfig
  /**
   * Whether the bridge instance is currently mounted. Mounted does not mean
   * connected: a server the bridge cannot reach stays mounted while it retries.
   */
  mounted: boolean
  /** The most recent connectivity test; absent until one has run this process. */
  lastTest?: McpConnectionTest
  /** Why the last mount attempt failed, when it did. */
  mountError?: string
}

/** What the page may do with the roster in this deployment. */
export interface McpCapabilities {
  /** Whether this deployment accepts writes. */
  canEdit: boolean
  /** The Host timeout one connectivity test runs under, in milliseconds. */
  testTimeoutMs: number
}

/** One complete roster read, returned by every write as well. */
export interface McpServerSnapshot {
  /** Every configured server, in roster order. */
  servers: McpServerView[]
  /** Revision the next write must present as `expectedRevision`. */
  revision: number
  /** What this deployment permits. */
  capabilities: McpCapabilities
}

declare module '@deepseek-ai/dsh-typert-protocol' {
  interface RemoteErrorDetailsMap {
    /** This deployment does not accept roster writes. */
    'mcp/not-editable': Record<string, never>
    /** No roster entry carries the requested id. */
    'mcp/unknown-server': { readonly id: string }
    /** Another entry already claims the model-facing namespace. */
    'mcp/duplicate-server-name': { readonly serverName: string }
    /** A rename was attempted on an immutable namespace. */
    'mcp/immutable-server-name': { readonly serverName: string }
    /** One entry field is unusable. */
    'mcp/invalid-entry': { readonly field: string; readonly reason: string }
    /** The caller's revision predates the current roster. */
    'mcp/stale-revision': { readonly expected: number; readonly actual: number }
  }
}
