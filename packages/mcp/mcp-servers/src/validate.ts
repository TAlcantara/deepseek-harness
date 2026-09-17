/**
 * Roster normalization and validation: the rules the settings schema cannot
 * express, applied before anything is persisted and again on every mount.
 *
 * @module
 */

import { RemoteError } from '@deepseek-ai/dsh-typert-protocol'
import {
  DEFAULT_TOOL_CALL_TIMEOUT_MS, SERVER_ID_PATTERN, SERVER_NAME_PATTERN,
} from './settings.ts'
import type { McpReconnectConfig, McpServerDraft, McpServerEntry, McpServerFields, McpServerPatch } from './types.ts'

/** Keys the reconnect policy accepts. */
const RECONNECT_KEYS = new Set(['enabled', 'initialDelayMs', 'maxDelayMs', 'maxAttempts'])

/** Build one invalid-entry failure. */
function invalid(field: string, reason: string): RemoteError<'mcp/invalid-entry'> {
  return new RemoteError('mcp/invalid-entry', `${field}: ${reason}`, { field, reason })
}

/**
 * Normalize one draft into complete roster fields: only the selected
 * transport keeps its values, and every optional value takes its default.
 *
 * @param draft - Form contents, complete or partial.
 * @returns Roster fields without the Host-assigned id.
 */
export function normalizeDraft(draft: McpServerDraft): McpServerFields {
  const common = {
    serverName: draft.serverName,
    enabled: draft.enabled ?? true,
    label: draft.label ?? '',
    toolCallTimeoutMs: draft.toolCallTimeoutMs ?? DEFAULT_TOOL_CALL_TIMEOUT_MS,
    failOnStartupError: draft.failOnStartupError ?? false,
    ...draft.reconnect === undefined ? {} : { reconnect: { ...draft.reconnect } },
  }
  return draft.transport === 'stdio'
    ? {
      ...common,
      transport: 'stdio',
      command: draft.command ?? '',
      args: [...draft.args ?? []],
      cwd: draft.cwd ?? '',
      env: { ...draft.env ?? {} },
      url: '',
      headers: {},
    }
    : {
      ...common,
      transport: 'streamable-http',
      command: '',
      args: [],
      cwd: '',
      env: {},
      url: draft.url ?? '',
      headers: { ...draft.headers ?? {} },
    }
}

/**
 * Apply one edit to a stored entry. Field values replace, and the secret maps
 * apply the variable-level rule: a string sets, `null` removes, and an absent
 * key keeps the stored value.
 *
 * @param entry - The stored entry being edited.
 * @param patch - Fields and secret-map operations to apply.
 * @returns The next entry; the input is not mutated.
 */
export function applyPatch(entry: McpServerEntry, patch: McpServerPatch): McpServerEntry {
  const next: McpServerEntry = { ...entry }
  if (patch.enabled !== undefined) next.enabled = patch.enabled
  if (patch.label !== undefined) next.label = patch.label
  if (patch.command !== undefined) next.command = patch.command
  if (patch.args !== undefined) next.args = [...patch.args]
  if (patch.cwd !== undefined) next.cwd = patch.cwd
  if (patch.url !== undefined) next.url = patch.url
  if (patch.toolCallTimeoutMs !== undefined) next.toolCallTimeoutMs = patch.toolCallTimeoutMs
  if (patch.failOnStartupError !== undefined) next.failOnStartupError = patch.failOnStartupError
  if (patch.reconnect !== undefined) next.reconnect = { ...patch.reconnect }
  if (patch.env !== undefined) next.env = mergeSecretMap(next.env, patch.env)
  if (patch.headers !== undefined) next.headers = mergeSecretMap(next.headers, patch.headers)
  if (patch.transport !== undefined && patch.transport !== entry.transport) {
    // Switching mechanisms drops the other side's values, so a stale command
    // never travels with an HTTP entry or the reverse.
    next.transport = patch.transport
    if (next.transport === 'stdio') {
      next.url = ''
      next.headers = {}
    } else {
      next.command = ''
      next.args = []
      next.cwd = ''
      next.env = {}
    }
  }
  return next
}

/**
 * Apply one variable-level secret patch.
 *
 * @param current - Stored values.
 * @param patch - Set/remove operations keyed by variable name.
 * @returns The next map; the input is not mutated.
 */
function mergeSecretMap(
  current: Record<string, string>,
  patch: Record<string, string | null>,
): Record<string, string> {
  const next: Record<string, string> = {}
  for (const [name, value] of Object.entries(current)) {
    if (patch[name] !== null) next[name] = value
  }
  for (const [name, value] of Object.entries(patch)) {
    if (value !== null) next[name] = value
  }
  return next
}

/**
 * Validate a complete roster: every entry well-formed and every model-facing
 * namespace unique. Applied before a write and again whenever entries mount,
 * because the settings document is also editable outside this process.
 *
 * @param servers - The roster to validate.
 * @throws RemoteError `mcp/invalid-entry` or `mcp/duplicate-server-name`.
 */
export function validateRoster(servers: readonly McpServerEntry[]): void {
  const names = new Set<string>()
  for (const entry of servers) {
    assertEntry(entry)
    if (names.has(entry.serverName)) {
      throw new RemoteError(
        'mcp/duplicate-server-name',
        `serverName "${entry.serverName}" is already in use by another MCP server`,
        { serverName: entry.serverName },
      )
    }
    names.add(entry.serverName)
  }
}

/** Reject one malformed entry. */
function assertEntry(entry: McpServerEntry): void {
  if (!SERVER_ID_PATTERN.test(entry.id)) throw invalid('id', 'must match [a-z0-9][a-z0-9-]{0,63}')
  if (!SERVER_NAME_PATTERN.test(entry.serverName)) {
    throw invalid('serverName', 'must match [A-Za-z0-9_-]{1,32}')
  }
  if (entry.transport === 'stdio') {
    if (entry.command.trim() === '') throw invalid('command', 'is required for a stdio server')
  } else {
    assertHttpUrl(entry.url)
  }
  assertSecretKeys('env', entry.env)
  assertSecretKeys('headers', entry.headers)
  if (!Number.isFinite(entry.toolCallTimeoutMs) || entry.toolCallTimeoutMs <= 0) {
    throw invalid('toolCallTimeoutMs', 'must be a positive finite number')
  }
  assertReconnect(entry.reconnect)
}

/** Require an absolute HTTP(S) endpoint. */
function assertHttpUrl(value: string): void {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw invalid('url', 'must be an absolute HTTP(S) URL')
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw invalid('url', 'must be an absolute HTTP(S) URL')
  }
}

/** Reject variable names the environment and HTTP header grammars cannot carry. */
function assertSecretKeys(field: 'env' | 'headers', values: Record<string, string>): void {
  for (const name of Object.keys(values)) {
    if (name.length === 0 || name.includes('=') || name.includes('\0')) {
      throw invalid(`${field}.${name}`, 'is not a usable variable name')
    }
  }
}

/** Reject a reconnect policy the bridge would refuse at mount. */
function assertReconnect(reconnect: McpReconnectConfig | undefined): void {
  if (reconnect === undefined) return
  for (const key of Object.keys(reconnect)) {
    if (!RECONNECT_KEYS.has(key)) throw invalid('reconnect', `"${key}" is not a reconnect option`)
  }
  const { initialDelayMs, maxDelayMs, maxAttempts } = reconnect
  for (const [key, value] of [['initialDelayMs', initialDelayMs], ['maxDelayMs', maxDelayMs]] as const) {
    if (value !== undefined && (!Number.isFinite(value) || value <= 0)) {
      throw invalid(`reconnect.${key}`, 'must be a positive finite number')
    }
  }
  if (initialDelayMs !== undefined && maxDelayMs !== undefined && initialDelayMs > maxDelayMs) {
    throw invalid('reconnect.initialDelayMs', 'must be less than or equal to maxDelayMs')
  }
  if (maxAttempts !== undefined && (!Number.isInteger(maxAttempts) || maxAttempts < 1)) {
    throw invalid('reconnect.maxAttempts', 'must be a positive integer')
  }
}
