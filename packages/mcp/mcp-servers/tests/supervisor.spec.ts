/**
 * The roster reconciler, driven against the real bridge and real stdio child
 * processes: what becomes mounted, what stays mounted, and what survives a
 * foreign registration conflict.
 */

import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import * as McpClient from '@deepseek-ai/dsh-mcp-client'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import { McpSupervisor } from '../src/supervisor.ts'
import type { McpServerEntry } from '../src/types.ts'

const packageDir = fileURLToPath(new URL('..', import.meta.url))
const fixtureServerPath = fileURLToPath(new URL('../../mcp-client/tests/fixture-server.ts', import.meta.url))
const gatedServerPath = fileURLToPath(new URL('./fixtures/env-gated-server.ts', import.meta.url))

const contexts: Context[] = []
const tempDirs: string[] = []

afterEach(async () => {
  await Promise.all(contexts.splice(0).map(ctx => ctx.fiber.dispose()))
  await Promise.all(tempDirs.splice(0).map(dir => rm(dir, { recursive: true, force: true })))
})

/** A host context with the tool registry the bridge registers into. */
async function hostContext(): Promise<Context> {
  const ctx = new Context()
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(ToolRuntime)
  contexts.push(ctx)
  return ctx
}

/** One complete roster entry; overrides apply last. */
function entry(overrides: Partial<McpServerEntry> = {}): McpServerEntry {
  return {
    id: 'srv-1',
    serverName: 'fixture',
    enabled: true,
    label: '',
    transport: 'stdio',
    command: process.execPath,
    args: [fixtureServerPath],
    cwd: packageDir,
    env: {},
    url: '',
    headers: {},
    toolCallTimeoutMs: 5_000,
    failOnStartupError: false,
    ...overrides,
  }
}

/** Poll one condition until it holds or the budget runs out. */
async function waitFor(condition: () => boolean | Promise<boolean>, what: string): Promise<void> {
  const deadline = Date.now() + 20_000
  while (!await condition()) {
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${what}`)
    await new Promise(resolve => setTimeout(resolve, 25))
  }
}

/** Let an already-resolved reconciliation chain run. */
async function settle(): Promise<void> {
  await new Promise(resolve => setTimeout(resolve, 150))
}

/** How many processes have started against one start log. */
async function startCount(log: string): Promise<number> {
  const text = await readFile(log, 'utf8').catch(() => '')
  return text.split('\n').filter(line => line !== '').length
}

describe('McpSupervisor', () => {
  it('mounts an enabled entry and unmounts it when it leaves the roster', async () => {
    const ctx = await hostContext()
    const supervisor = new McpSupervisor(ctx)

    supervisor.enqueue([entry()])
    await waitFor(() => ctx.tools.get('mcp__fixture__greet') !== undefined, 'the fixture tool')
    expect(supervisor.isMounted('srv-1')).toBe(true)
    expect(supervisor.mountErrorOf('srv-1')).toBeUndefined()

    supervisor.enqueue([])
    await waitFor(() => ctx.tools.get('mcp__fixture__greet') === undefined, 'the tool to unregister')
    expect(supervisor.isMounted('srv-1')).toBe(false)
    expect(supervisor.mountErrorOf('srv-1')).toBeUndefined()
  }, 60_000)

  it('never mounts a disabled entry and unmounts one that becomes disabled', async () => {
    const ctx = await hostContext()
    const supervisor = new McpSupervisor(ctx)

    supervisor.enqueue([entry({ enabled: false })])
    await settle()
    expect(supervisor.isMounted('srv-1')).toBe(false)

    supervisor.enqueue([entry()])
    await waitFor(() => supervisor.isMounted('srv-1'), 'the mount')
    supervisor.enqueue([entry({ enabled: false })])
    await waitFor(() => !supervisor.isMounted('srv-1'), 'the unmount')
    expect(ctx.tools.get('mcp__fixture__greet')).toBeUndefined()
  }, 60_000)

  it('keeps the instance for a presentation-only change and remounts on a field change', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'dsh-mcp-supervisor-'))
    tempDirs.push(dir)
    const startLog = join(dir, 'starts.log')
    const ctx = await hostContext()
    const supervisor = new McpSupervisor(ctx)
    const mounted = entry({
      serverName: 'gated',
      command: process.execPath,
      args: [gatedServerPath],
      env: { ROSTER_PROBE_TOKEN: 'expected-token', ROSTER_START_LOG: startLog },
    })

    supervisor.enqueue([mounted])
    await waitFor(() => ctx.tools.get('mcp__gated__gated') !== undefined, 'the gated tool')
    expect(await startCount(startLog)).toBe(1)

    // A label is presentation only, so the live instance is left alone.
    supervisor.enqueue([{ ...mounted, label: 'renamed' }])
    await settle()
    expect(await startCount(startLog)).toBe(1)

    // A field the bridge consumes rebuilds the instance.
    supervisor.enqueue([{ ...mounted, args: [gatedServerPath, 'extra'] }])
    await waitFor(async () => await startCount(startLog) === 2, 'the remount')
    await waitFor(() => ctx.tools.get('mcp__gated__gated') !== undefined, 'the remounted tool')
  }, 60_000)

  it('records a namespace conflict without stopping other entries', async () => {
    const ctx = await hostContext()
    // Occupy `fixture` the way a deployment-owned cordis.yml row would.
    await ctx.plugin(McpClient, {
      transport: 'stdio',
      serverName: 'fixture',
      command: process.execPath,
      args: [fixtureServerPath],
      env: {},
      cwd: packageDir,
      toolCallTimeoutMs: 5_000,
      failOnStartupError: false,
    })
    const supervisor = new McpSupervisor(ctx)

    supervisor.enqueue([
      entry({ id: 'srv-conflict', serverName: 'fixture' }),
      entry({ id: 'srv-ok', serverName: 'unaffected' }),
    ])

    await waitFor(() => ctx.tools.get('mcp__unaffected__greet') !== undefined, 'the unaffected tool')
    expect(supervisor.mountErrorOf('srv-conflict')).toBeTruthy()
    expect(supervisor.isMounted('srv-conflict')).toBe(false)
    expect(supervisor.isMounted('srv-ok')).toBe(true)
  }, 60_000)

  it('unmounts everything on disposal and ignores later work', async () => {
    const ctx = await hostContext()
    const supervisor = new McpSupervisor(ctx)

    supervisor.enqueue([entry()])
    await waitFor(() => ctx.tools.get('mcp__fixture__greet') !== undefined, 'the fixture tool')

    await supervisor.dispose()
    expect(supervisor.isMounted('srv-1')).toBe(false)
    expect(ctx.tools.get('mcp__fixture__greet')).toBeUndefined()

    supervisor.enqueue([entry({ id: 'srv-late', serverName: 'late' })])
    await settle()
    expect(supervisor.isMounted('srv-late')).toBe(false)
  }, 60_000)

  it('drops work queued before disposal', async () => {
    const ctx = await hostContext()
    const supervisor = new McpSupervisor(ctx)

    // The reconciliation is still queued when disposal marks the supervisor
    // closed, so it must return without mounting anything.
    supervisor.enqueue([entry()])
    await supervisor.dispose()
    await settle()

    expect(supervisor.isMounted('srv-1')).toBe(false)
    expect(ctx.tools.get('mcp__fixture__greet')).toBeUndefined()
  }, 60_000)
})
