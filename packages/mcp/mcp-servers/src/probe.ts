/**
 * Connectivity testing for the roster: a bounded concurrency gate in front of
 * the bridge's one-shot probe, plus the last result per saved entry. Results
 * are process-local observations, never persisted configuration.
 *
 * @module
 */

import type * as McpClient from '@deepseek-ai/dsh-mcp-client'
import { toClientConfig } from './settings.ts'
import type { McpConnectionTest, McpServerFields } from './types.ts'

/** The bridge surface this gate drives. */
export type ProbeClient = Pick<typeof McpClient, 'probeConnection'>

/** Concurrency ceiling and total timeout for connectivity testing. */
export interface McpProbeConfig {
  /** Total budget one test runs under, in milliseconds. */
  testTimeoutMs: number
  /** How many tests may run at once; further callers wait their turn. */
  maxConcurrentTests: number
}

/**
 * Serialized-by-limit probe gateway.
 *
 * Excess callers queue rather than fail: a refusal would surface as a
 * connectivity failure the operator cannot distinguish from a real one.
 */
export class McpProbe {
  private readonly cache = new Map<string, McpConnectionTest>()
  private readonly inflight = new Set<AbortController>()
  private readonly waiters: Array<() => void> = []
  private running = 0

  /**
   * @param client - The bridge's probe entry point.
   * @param config - Concurrency ceiling and total timeout.
   */
  constructor(
    private readonly client: ProbeClient,
    private readonly config: McpProbeConfig,
  ) {}

  /**
   * Test one server, caching the outcome when the target is a saved entry.
   *
   * @param entry - Roster fields, with secret values already resolved.
   * @param cacheKey - Roster id to cache under; omit for an unsaved draft.
   * @param signal - Caller cancellation, honoured alongside the total timeout.
   * @returns The test outcome; never rejects for a server that simply failed.
   */
  async test(
    entry: McpServerFields,
    cacheKey: string | undefined,
    signal: AbortSignal,
  ): Promise<McpConnectionTest> {
    await this.acquire()
    // A fresh controller per test is what disposal aborts, so one teardown
    // cancels every in-flight probe without touching the caller's signal.
    const teardown = new AbortController()
    this.inflight.add(teardown)
    const startedAt = Date.now()
    try {
      const result = await this.client.probeConnection(toClientConfig(entry), {
        timeoutMs: this.config.testTimeoutMs,
        signal: AbortSignal.any([signal, teardown.signal]),
      })
      const outcome: McpConnectionTest = {
        ok: result.ok,
        tools: result.tools,
        ...result.error === undefined ? {} : { error: result.error },
        at: startedAt,
        durationMs: Date.now() - startedAt,
      }
      // Only saved entries keep a result: a draft's outcome belongs to the form
      // that produced it, and caching it would outlive the values it tested.
      if (cacheKey !== undefined) this.cache.set(cacheKey, outcome)
      return outcome
    } finally {
      this.inflight.delete(teardown)
      this.release()
    }
  }

  /**
   * The last result recorded for one saved entry.
   * @param id - Roster entry id.
   * @returns The cached outcome, or undefined when it has not been tested.
   */
  cached(id: string): McpConnectionTest | undefined {
    return this.cache.get(id)
  }

  /**
   * Drop one entry's cached result.
   * @param id - Roster entry id that no longer exists.
   */
  forget(id: string): void {
    this.cache.delete(id)
  }

  /**
   * Abort every in-flight test and wait for them all to settle.
   */
  async dispose(): Promise<void> {
    for (const controller of [...this.inflight]) controller.abort()
    while (this.running > 0) await new Promise<void>((resolve) => { this.waiters.push(resolve) })
    this.cache.clear()
  }

  /** Take one concurrency slot, waiting for the queue when all are busy. */
  private async acquire(): Promise<void> {
    if (this.running < this.config.maxConcurrentTests) {
      this.running += 1
      return
    }
    await new Promise<void>((resolve) => { this.waiters.push(resolve) })
    this.running += 1
  }

  /** Return one concurrency slot and wake the longest-waiting caller. */
  private release(): void {
    this.running -= 1
    this.waiters.shift()?.()
  }
}
