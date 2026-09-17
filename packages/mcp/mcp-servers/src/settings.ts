/**
 * Settings namespace, schema, and the translation into the bridge's own
 * configuration. The namespace is the roster's single source of truth; the
 * mounted bridge instances are derived from it.
 *
 * @module
 */

import z from '@deepseek-ai/schemastery'
import type { Config as McpClientConfig } from '@deepseek-ai/dsh-mcp-client'
import type { McpReconnectConfig, McpServerEntry, McpServerFields } from './types.ts'

/** Settings namespace holding the MCP server roster. */
export const MCP_SETTINGS_NAMESPACE = 'mcp'

/** Model-facing tool namespace pattern, mirroring `dsh-mcp-client`. */
export const SERVER_NAME_PATTERN = /^[A-Za-z0-9_-]{1,32}$/

/** Roster entry id pattern. */
export const SERVER_ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/

/** Default per-tool-call timeout, mirroring `dsh-mcp-client`. */
export const DEFAULT_TOOL_CALL_TIMEOUT_MS = 60_000

const ReconnectSchema = z.object({
  enabled: z.boolean().required(false),
  initialDelayMs: z.number().required(false),
  maxDelayMs: z.number().required(false),
  maxAttempts: z.number().required(false),
})

/** One persisted roster entry. Secret values never cross the wire. */
export const McpServerEntrySchema = z.object({
  id: z.string().required().pattern(SERVER_ID_PATTERN),
  serverName: z.string().required().pattern(SERVER_NAME_PATTERN),
  enabled: z.boolean().default(true),
  label: z.string().default(''),
  transport: z.union([z.const('stdio'), z.const('streamable-http')]).required(),
  command: z.string().default(''),
  args: z.array(String).default([]),
  cwd: z.string().default(''),
  env: z.dict(z.string().role('secret')).default({}),
  url: z.string().default(''),
  headers: z.dict(z.string().role('secret')).default({}),
  toolCallTimeoutMs: z.number().default(DEFAULT_TOOL_CALL_TIMEOUT_MS),
  failOnStartupError: z.boolean().default(false),
  reconnect: ReconnectSchema.required(false),
})

/** The namespace's complete value. */
export const McpSettingsSchema: z<{ servers: McpServerEntry[] }> = z.object({
  servers: z.array(McpServerEntrySchema).default([]),
})

/**
 * The entry's explicit reconnect policy, or undefined when it declares none.
 *
 * The settings schema materializes an absent optional object as `{}`, so
 * "declares no policy" is the absence of any set option rather than an absent
 * field.
 *
 * @param reconnect - Policy as stored, possibly empty.
 * @returns The policy when it sets at least one option, otherwise undefined.
 */
export function explicitReconnect(reconnect: McpReconnectConfig | undefined): McpReconnectConfig | undefined {
  if (reconnect === undefined) return undefined
  return Object.values(reconnect).some(value => value !== undefined) ? reconnect : undefined
}

/**
 * Translate one roster entry into the bridge's configuration.
 *
 * Only the selected transport's fields are emitted, so an entry that switched
 * mechanisms never carries the other mechanism's leftovers.
 *
 * @param entry - Roster fields, with secret values already resolved.
 * @returns The configuration `dsh-mcp-client` mounts.
 */
export function toClientConfig(entry: McpServerFields): McpClientConfig {
  const reconnect = explicitReconnect(entry.reconnect)
  const base = {
    serverName: entry.serverName,
    toolCallTimeoutMs: entry.toolCallTimeoutMs,
    failOnStartupError: entry.failOnStartupError,
    ...reconnect === undefined ? {} : { reconnect },
  }
  return entry.transport === 'stdio'
    ? { ...base, transport: 'stdio', command: entry.command, args: entry.args, env: entry.env, cwd: entry.cwd }
    : { ...base, transport: 'streamable-http', url: entry.url, headers: entry.headers }
}
