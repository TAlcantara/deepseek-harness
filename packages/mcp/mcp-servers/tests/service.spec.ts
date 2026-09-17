/**
 * The roster service end to end: settings-backed writes, reconciliation into
 * real bridge instances, connectivity testing, and the failures the page
 * renders. Uses the real file-backed settings provider and real stdio servers.
 */

import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import * as McpClient from '@deepseek-ai/dsh-mcp-client'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import FileSettingsProvider from '@deepseek-ai/dsh-settings-file'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import { RemoteError } from '@deepseek-ai/dsh-typert-protocol'
import { McpServers } from '../src/index.ts'
import type { Config } from '../src/index.ts'
import type { McpServerDraft, McpServerEntry } from '../src/types.ts'

const packageDir = fileURLToPath(new URL('..', import.meta.url))
const fixtureServerPath = fileURLToPath(new URL('../../mcp-client/tests/fixture-server.ts', import.meta.url))
const gatedServerPath = fileURLToPath(new URL('./fixtures/env-gated-server.ts', import.meta.url))

const contexts: Context[] = []
const tempDirs: string[] = []

afterEach(async () => {
  await Promise.all(contexts.splice(0).map(ctx => ctx.fiber.dispose()))
  await Promise.all(tempDirs.splice(0).map(dir => rm(dir, { recursive: true, force: true })))
})

/** One complete stored entry; overrides apply last. */
function entry(overrides: Partial<McpServerEntry> = {}): McpServerEntry {
  return {
    id: 'srv-seeded',
    serverName: 'seeded',
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

/** One new-server draft; overrides apply last. */
function draft(overrides: Partial<McpServerDraft> = {}): McpServerDraft {
  return {
    serverName: 'fixture',
    transport: 'stdio',
    command: process.execPath,
    args: [fixtureServerPath],
    cwd: packageDir,
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

/** Boot the service over a real file-backed settings document. */
async function bootService(config: Partial<Config> = {}): Promise<{ ctx: Context; service: McpServers }> {
  const dir = await mkdtemp(join(tmpdir(), 'dsh-mcp-servers-'))
  tempDirs.push(dir)
  const ctx = new Context()
  contexts.push(ctx)
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(ToolRuntime)
  await ctx.plugin(FileSettingsProvider, { path: join(dir, 'settings.yaml'), watch: false })
  await ctx.plugin(McpServers, {
    initialServers: [],
    editable: true,
    testTimeoutMs: 10_000,
    maxConcurrentTests: 2,
    ...config,
  })
  return { ctx, service: ctx.mcpServers }
}

/** Run one Remote call and return the failure it must produce. */
async function failureOf(run: () => Promise<unknown>): Promise<RemoteError> {
  try {
    await run()
  } catch (error: unknown) {
    return error as RemoteError
  }
  throw new Error('expected the call to fail')
}

describe('McpServers', () => {
  it('reads an empty roster with the deployment capabilities', async () => {
    const { service } = await bootService()

    const snapshot = await service.list()

    expect(snapshot.servers).toEqual([])
    expect(snapshot.revision).toBe(0)
    expect(snapshot.capabilities).toEqual({ canEdit: true, testTimeoutMs: 10_000 })
  })

  it('adds a server, mounts it, and persists the roster', async () => {
    const { ctx, service } = await bootService()

    const added = await service.add(draft(), 0)

    expect(added.servers).toHaveLength(1)
    const view = added.servers[0]
    expect(view?.id).toMatch(/^srv-[0-9a-f]{16}$/)
    expect(view?.serverName).toBe('fixture')
    expect(view?.envKeys).toEqual([])
    expect(view?.headerKeys).toEqual([])
    expect(view?.mounted).toBe(false)

    await waitFor(() => ctx.tools.get('mcp__fixture__greet') !== undefined, 'the fixture tool')
    const snapshot = await service.list()
    expect(snapshot.servers[0]?.mounted).toBe(true)
    expect(snapshot.revision).toBe(1)
  }, 60_000)

  it('carries a reconnect policy through to the view', async () => {
    const { service } = await bootService()

    const added = await service.add(draft({ reconnect: { enabled: false, maxAttempts: 3 } }), 0)

    expect(added.servers[0]?.reconnect).toEqual({ enabled: false, maxAttempts: 3 })
  })

  it('rejects a duplicate model-facing namespace', async () => {
    const { service } = await bootService()
    await service.add(draft(), 0)

    const failure = await failureOf(() => service.add(draft(), 1))

    expect(failure.code).toBe('mcp/duplicate-server-name')
    expect(failure.details).toMatchObject({ serverName: 'fixture' })
  })

  it('rejects a stdio server without a command', async () => {
    const { service } = await bootService()

    const failure = await failureOf(() => service.add(draft({ command: '  ' }), 0))

    expect(failure.code).toBe('mcp/invalid-entry')
    expect(failure.details).toMatchObject({ field: 'command' })
  })

  it('edits fields and applies the variable-level secret patch', async () => {
    const { service } = await bootService()
    const added = await service.add(draft({ env: { KEEP: 'a', DROP: 'b' } }), 0)
    const id = added.servers[0]?.id as string

    const updated = await service.update(id, {
      label: 'Renamed',
      env: { KEEP: 'c', DROP: null, ADD: 'd' },
    }, added.revision)

    expect(updated.servers[0]?.label).toBe('Renamed')
    expect(updated.servers[0]?.envKeys).toEqual(['ADD', 'KEEP'])
  })

  it('edits one entry without touching its neighbours', async () => {
    const { service } = await bootService()
    const first = await service.add(draft({ env: { KEEP: 'a' } }), 0)
    const second = await service.add(draft({ serverName: 'second' }), first.revision)
    const firstId = second.servers[0]?.id as string

    const edited = await service.update(firstId, { label: 'Edited' }, second.revision)

    expect(edited.servers[0]?.label).toBe('Edited')
    expect(edited.servers[0]?.envKeys).toEqual(['KEEP'])
    expect(edited.servers[1]?.serverName).toBe('second')
    expect(edited.servers[1]?.label).toBe('')
  })

  it('refuses to change a server namespace', async () => {
    const { service } = await bootService()
    const added = await service.add(draft(), 0)
    const id = added.servers[0]?.id as string

    const named = await failureOf(() => service.update(id, { serverName: 'other' } as never, 1))
    const unnamed = await failureOf(() => service.update(id, { serverName: 42 } as never, 1))

    expect(named.code).toBe('mcp/immutable-server-name')
    expect(named.details).toMatchObject({ serverName: 'other' })
    expect(unnamed.code).toBe('mcp/immutable-server-name')
    expect(unnamed.details).toMatchObject({ serverName: '' })
  })

  it('rejects an edit or a removal of an unknown server', async () => {
    const { service } = await bootService()

    const edit = await failureOf(() => service.update('srv-absent', { label: 'x' }, 0))
    const removal = await failureOf(() => service.deleteServer('srv-absent', 0))
    const toggle = await failureOf(() => service.setEnabled('srv-absent', false, 0))

    expect(edit.code).toBe('mcp/unknown-server')
    expect(removal.code).toBe('mcp/unknown-server')
    expect(toggle.code).toBe('mcp/unknown-server')
  })

  it('removes a server and releases its namespace', async () => {
    const { ctx, service } = await bootService()
    const added = await service.add(draft(), 0)
    const id = added.servers[0]?.id as string
    await waitFor(() => ctx.tools.get('mcp__fixture__greet') !== undefined, 'the fixture tool')

    const removed = await service.deleteServer(id, added.revision)

    expect(removed.servers).toEqual([])
    await waitFor(() => ctx.tools.get('mcp__fixture__greet') === undefined, 'the tool to unregister')

    // The namespace is free again, so the same server can be added back.
    const readded = await service.add(draft(), removed.revision)
    expect(readded.servers).toHaveLength(1)
  }, 60_000)

  it('disables a server without discarding its configuration', async () => {
    const { ctx, service } = await bootService()
    const added = await service.add(draft(), 0)
    const id = added.servers[0]?.id as string
    await waitFor(() => ctx.tools.get('mcp__fixture__greet') !== undefined, 'the fixture tool')

    const disabled = await service.setEnabled(id, false, added.revision)

    expect(disabled.servers[0]?.enabled).toBe(false)
    expect(disabled.servers[0]?.command).toBe(process.execPath)
    await waitFor(() => ctx.tools.get('mcp__fixture__greet') === undefined, 'the tool to unregister')
  }, 60_000)

  it('refuses a write presented at a stale revision', async () => {
    const { service } = await bootService()
    await service.add(draft(), 0)

    const failure = await failureOf(() => service.add(draft({ serverName: 'second' }), 0))

    expect(failure.code).toBe('mcp/stale-revision')
    expect(failure.details).toMatchObject({ expected: 0, actual: 1 })
  })

  it('mounts a Streamable HTTP server through its own field set', async () => {
    const { service } = await bootService()

    const added = await service.add(draft({
      serverName: 'web',
      transport: 'streamable-http',
      url: 'http://127.0.0.1:9/mcp',
      headers: { Authorization: 'Bearer value' },
      reconnect: { enabled: false },
    }), 0)

    expect(added.servers[0]?.url).toBe('http://127.0.0.1:9/mcp')
    expect(added.servers[0]?.command).toBe('')
    await waitFor(async () => (await service.list()).servers[0]?.mounted === true, 'the HTTP mount')
    await service.deleteServer(added.servers[0]?.id as string, added.revision)
    await waitFor(async () => (await service.list()).servers.length === 0, 'the HTTP unmount')
  }, 60_000)

  it('never returns a stored secret value', async () => {
    const { service } = await bootService()

    const stdio = await service.add(draft({ env: { TOKEN: 's3cr3t-value' } }), 0)
    const http = await service.add(draft({
      serverName: 'web',
      transport: 'streamable-http',
      url: 'http://127.0.0.1:9/mcp',
      headers: { Authorization: 'Bearer s3cr3t-value' },
    }), stdio.revision)

    expect(stdio.servers[0]?.envKeys).toEqual(['TOKEN'])
    expect(http.servers[1]?.headerKeys).toEqual(['Authorization'])
    expect(JSON.stringify(http)).not.toContain('s3cr3t-value')
    expect(JSON.stringify(await service.list())).not.toContain('s3cr3t-value')
  })

  it('rejects every write in a read-only deployment', async () => {
    const { service } = await bootService({ initialServers: [entry()], editable: false })
    const listed = await service.list()
    const id = listed.servers[0]?.id as string

    const writes = await Promise.all([
      failureOf(() => service.add(draft({ serverName: 'second' }), listed.revision)),
      failureOf(() => service.update(id, { label: 'x' }, listed.revision)),
      failureOf(() => service.deleteServer(id, listed.revision)),
      failureOf(() => service.setEnabled(id, false, listed.revision)),
    ])

    for (const failure of writes) expect(failure.code).toBe('mcp/not-editable')
    expect((await service.list()).servers).toHaveLength(1)
  }, 60_000)

  it('tests an unsaved draft without mounting or registering anything', async () => {
    const { ctx, service } = await bootService()
    const before = ctx.tools.schemas().map(schema => schema.name)

    const result = await service.testConnection({ draft: draft() }, new AbortController().signal)

    expect(result.ok).toBe(true)
    expect(result.tools).toContain('greet')
    expect(ctx.tools.schemas().map(schema => schema.name)).toEqual(before)
  }, 60_000)

  it('reports a failing draft test without throwing', async () => {
    const { service } = await bootService()

    const result = await service.testConnection(
      { draft: draft({ command: join(tmpdir(), 'dsh-mcp-absent-binary') }) },
      new AbortController().signal,
    )

    expect(result.ok).toBe(false)
    expect(result.tools).toEqual([])
    expect(result.error).toBeTruthy()
  }, 60_000)

  it('fills a draft test with the stored secret values of the entry it derives from', async () => {
    const { service } = await bootService()
    const added = await service.add(draft({
      serverName: 'gated',
      args: [gatedServerPath],
      env: { ROSTER_PROBE_TOKEN: 'expected-token' },
    }), 0)
    const id = added.servers[0]?.id as string
    const withoutSecret = draft({ serverName: 'gated', args: [gatedServerPath] })

    const stored = await service.testConnection(
      { draft: withoutSecret, basedOn: id },
      new AbortController().signal,
    )
    const draftOnly = await service.testConnection({ draft: withoutSecret }, new AbortController().signal)

    expect(stored.ok).toBe(true)
    expect(stored.tools).toEqual(['gated'])
    expect(draftOnly.ok).toBe(false)
  }, 90_000)

  it('rejects a test based on a server that is gone', async () => {
    const { service } = await bootService()

    const failure = await failureOf(() => service.testConnection(
      { draft: draft(), basedOn: 'srv-absent' },
      new AbortController().signal,
    ))

    expect(failure.code).toBe('mcp/unknown-server')
    expect(failure.details).toMatchObject({ id: 'srv-absent' })
  })

  it('reports the last test result on the saved entry that owns it', async () => {
    const { service } = await bootService()
    const added = await service.add(draft(), 0)
    const id = added.servers[0]?.id as string

    await service.testConnection({ draft: draft({ serverName: 'fixture' }), basedOn: id }, new AbortController().signal)
    const snapshot = await service.list()

    expect(snapshot.servers[0]?.lastTest?.ok).toBe(true)
    expect(snapshot.servers[0]?.lastTest?.tools).toContain('greet')
  }, 60_000)

  it('reports a namespace conflict on the affected entry only', async () => {
    const { ctx, service } = await bootService()
    await ctx.plugin(McpClient, {
      transport: 'stdio',
      serverName: 'taken',
      command: process.execPath,
      args: [fixtureServerPath],
      env: {},
      cwd: packageDir,
      toolCallTimeoutMs: 5_000,
      failOnStartupError: false,
    })

    const added = await service.add(draft({ serverName: 'taken' }), 0)

    await waitFor(async () => (await service.list()).servers[0]?.mountError !== undefined, 'the mount failure')
    const snapshot = await service.list()
    expect(snapshot.servers[0]?.mounted).toBe(false)
    expect(snapshot.servers[0]?.mountError).toBeTruthy()
    expect(added.servers[0]?.mounted).toBe(false)
  }, 60_000)

  it('fails loud when the settings provider is gone', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'dsh-mcp-servers-'))
    tempDirs.push(dir)
    const ctx = new Context()
    contexts.push(ctx)
    await ctx.plugin(SystemPrompt)
    await ctx.plugin(ToolRuntime)
    const provider = await ctx.plugin(FileSettingsProvider, { path: join(dir, 'settings.yaml'), watch: false })
    await ctx.plugin(McpServers, {
      initialServers: [],
      editable: true,
      testTimeoutMs: 10_000,
      maxConcurrentTests: 2,
    })
    const service = ctx.mcpServers

    await provider.dispose()

    await expect(async () => await service.list()).rejects.toThrow('the mcp settings namespace is not registered')
  })
})
