/**
 * The probe gateway: result mapping, per-entry caching, the concurrency
 * ceiling, and disposal. The bridge's own probe is replaced with a stub here;
 * its real behavior is covered by the package's own suite.
 */

import { describe, expect, it } from 'vitest'
import { McpProbe } from '../src/probe.ts'
import type { ProbeClient } from '../src/probe.ts'
import type { McpServerFields } from '../src/types.ts'

/** One resolved roster entry. */
function fields(overrides: Partial<McpServerFields> = {}): McpServerFields {
  return {
    serverName: 'fixture',
    enabled: true,
    label: '',
    transport: 'stdio',
    command: 'node',
    args: [],
    cwd: '',
    env: {},
    url: '',
    headers: {},
    toolCallTimeoutMs: 60_000,
    failOnStartupError: false,
    ...overrides,
  }
}

/** A bridge stub that answers each call from a queue. */
function stubClient(
  answer: (call: number) => { ok: boolean; tools: string[]; error?: string },
): { client: ProbeClient; calls: () => number } {
  let calls = 0
  return {
    client: {
      probeConnection: async () => {
        calls += 1
        return answer(calls)
      },
    },
    calls: () => calls,
  }
}

describe('McpProbe', () => {
  it('maps a successful bridge probe into a dated test result', async () => {
    const { client } = stubClient(() => ({ ok: true, tools: ['gated'] }))
    const probe = new McpProbe(client, { testTimeoutMs: 5_000, maxConcurrentTests: 2 })

    const result = await probe.test(fields(), undefined, new AbortController().signal)

    expect(result.ok).toBe(true)
    expect(result.tools).toEqual(['gated'])
    expect(result.error).toBeUndefined()
    expect(result.durationMs).toBeGreaterThanOrEqual(0)
    expect(result.at).toBeLessThanOrEqual(Date.now())
  })

  it('records the bridge failure summary', async () => {
    const { client } = stubClient(() => ({ ok: false, tools: [], error: 'timed out after 100ms' }))
    const probe = new McpProbe(client, { testTimeoutMs: 5_000, maxConcurrentTests: 2 })

    const result = await probe.test(fields(), undefined, new AbortController().signal)

    expect(result.ok).toBe(false)
    expect(result.error).toBe('timed out after 100ms')
  })

  it('caches a saved entry result and forgets it on request', async () => {
    const { client } = stubClient(() => ({ ok: true, tools: ['gated'] }))
    const probe = new McpProbe(client, { testTimeoutMs: 5_000, maxConcurrentTests: 2 })

    expect(probe.cached('srv-1')).toBeUndefined()
    await probe.test(fields(), 'srv-1', new AbortController().signal)
    expect(probe.cached('srv-1')?.tools).toEqual(['gated'])

    probe.forget('srv-1')
    expect(probe.cached('srv-1')).toBeUndefined()
  })

  it('never caches a draft result', async () => {
    const { client } = stubClient(() => ({ ok: true, tools: [] }))
    const probe = new McpProbe(client, { testTimeoutMs: 5_000, maxConcurrentTests: 2 })

    await probe.test(fields(), undefined, new AbortController().signal)

    expect(probe.cached('fixture')).toBeUndefined()
  })

  it('queues excess tests instead of running them together', async () => {
    let active = 0
    let peak = 0
    const client = {
      probeConnection: async () => {
        active += 1
        peak = Math.max(peak, active)
        await new Promise(resolve => setTimeout(resolve, 5))
        active -= 1
        return { ok: true, tools: [] }
      },
    } as unknown as ProbeClient
    const probe = new McpProbe(client, { testTimeoutMs: 5_000, maxConcurrentTests: 1 })

    await Promise.all([
      probe.test(fields({ serverName: 'a' }), undefined, new AbortController().signal),
      probe.test(fields({ serverName: 'b' }), undefined, new AbortController().signal),
      probe.test(fields({ serverName: 'c' }), undefined, new AbortController().signal),
    ])

    expect(peak).toBe(1)
  })

  it('passes the caller signal through to the bridge', async () => {
    const controller = new AbortController()
    const seen: AbortSignal[] = []
    const client = {
      probeConnection: async (_config: unknown, options?: { signal?: AbortSignal }) => {
        seen.push(options?.signal as AbortSignal)
        return { ok: true, tools: [] }
      },
    } as unknown as ProbeClient
    const probe = new McpProbe(client, { testTimeoutMs: 5_000, maxConcurrentTests: 2 })

    await probe.test(fields(), undefined, controller.signal)

    expect(seen[0]?.aborted).toBe(false)
  })

  it('aborts in-flight tests on disposal and waits for them to settle', async () => {
    const settled: string[] = []
    let markEntered: () => void = () => {}
    const entered = new Promise<void>((resolve) => { markEntered = resolve })
    const client = {
      probeConnection: async (_config: unknown, options?: { signal?: AbortSignal }) => {
        const signal = options?.signal as AbortSignal
        markEntered()
        await new Promise<void>((resolve) => {
          signal.addEventListener('abort', () => { resolve() }, { once: true })
        })
        settled.push('aborted')
        return { ok: false, tools: [], error: 'canceled' }
      },
    } as unknown as ProbeClient
    const probe = new McpProbe(client, { testTimeoutMs: 5_000, maxConcurrentTests: 2 })
    const pending = probe.test(fields(), 'srv-1', new AbortController().signal)

    await entered
    await probe.dispose()
    await pending

    expect(settled).toEqual(['aborted'])
    expect(probe.cached('srv-1')).toBeUndefined()
  })
})
