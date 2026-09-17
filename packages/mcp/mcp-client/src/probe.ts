/**
 * One-shot connectivity probe for one MCP server: connect, drain the tool
 * list, and close. The probe is deliberately outside the bridge's lifecycle —
 * it registers nothing on `ctx.tools`, reserves no `serverName`, and never
 * enters the reconnect loop — so a configuration surface can answer "does
 * this server work?" before or after the server is mounted.
 *
 * @module
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { createTransport } from './transport.ts'
import { drainToolPages } from './tools.ts'
import type { Config } from './index.ts'

/** Total budget one probe may spend on connect, discovery, and close. */
const DEFAULT_PROBE_TIMEOUT_MS = 15_000

/**
 * Close budget: the MCP SDK's stdio transport owns two two-second termination
 * grace periods, so one further interval proves the transport is wedged
 * instead of merely slow.
 */
const PROBE_CLOSE_TIMEOUT_MS = 5_000

/** Options for {@link probeConnection}. */
export interface ProbeOptions {
  /** Total budget in milliseconds; defaults to 15000. */
  timeoutMs?: number
  /** Caller cancellation; the probe still closes before returning. */
  signal?: AbortSignal
}

/** One probe outcome. */
export interface ProbeResult {
  /** True only when the connection and the complete tool list succeeded. */
  ok: boolean
  /** The server's own tool names; empty on failure. */
  tools: string[]
  /** Failure summary; absent on success. Never contains credential values. */
  error?: string
}

/**
 * Connect to one MCP server, list its tools, and close.
 *
 * The configured `transport` decides the mechanism, so the probe shares the
 * bridge's stdio environment scrubbing and Streamable HTTP handling. Failures
 * are reported as `ok: false` rather than thrown, because "this server is
 * unreachable" is an answer the caller renders, not a programming error.
 *
 * @param config - Target server configuration, as the bridge would receive it.
 * @param options - Total budget and optional caller cancellation.
 * @returns The probe outcome; the transport is closed before it settles.
 */
export async function probeConnection(config: Config, options: ProbeOptions = {}): Promise<ProbeResult> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_PROBE_TIMEOUT_MS
  const timeout = new AbortController()
  // Unref'd and cleared, so a finished probe never holds the Host or a test
  // runner open waiting for the budget to elapse.
  const timer = setTimeout(() => { timeout.abort() }, timeoutMs)
  timer.unref()
  const budget = options.signal === undefined
    ? timeout.signal
    : AbortSignal.any([timeout.signal, options.signal])
  const client = new Client({ name: 'dsh-mcp-client', version: '0.0.1' }, { capabilities: {} })
  const closed: PromiseWithResolvers<void> = Promise.withResolvers()
  client.onclose = () => { closed.resolve() }
  try {
    await client.connect(createTransport(config), { signal: budget })
    const tools = await drainToolPages(client, { label: `mcp-client(${config.serverName})`, signal: budget })
    return { ok: true, tools: tools.map(tool => tool.name) }
  } catch (error: unknown) {
    const message = options.signal?.aborted === true
      ? 'canceled'
      : timeout.signal.aborted
        ? `timed out after ${timeoutMs}ms`
        : String(error)
    return { ok: false, tools: [], error: message }
  } finally {
    clearTimeout(timer)
    await closeWithin(client, closed.promise, PROBE_CLOSE_TIMEOUT_MS)
  }
}

/**
 * Close the probe's client and wait for the transport to report closed, so a
 * stdio child is reaped before the probe settles. The wait is bounded: a
 * wedged transport delays the answer instead of holding the caller forever.
 *
 * @param client - The probe's client, connected or not.
 * @param closed - The transport's own close signal.
 * @param timeoutMs - Budget for the close itself.
 */
async function closeWithin(client: Client, closed: Promise<void>, timeoutMs: number): Promise<void> {
  try { await client.close() } catch { /* the transport may already be gone */ }
  await Promise.race([closed, delay(timeoutMs)])
}

/**
 * Resolve after one interval, without holding the process open.
 * @param ms - Interval in milliseconds.
 */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => { setTimeout(resolve, ms).unref() })
}
