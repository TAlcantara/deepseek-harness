/**
 * The MCP server roster through the real Cordis Loader: the settings document
 * is the source of truth, each entry mounts a real `dsh-mcp-client` instance
 * against a keyless fixture server, and a namespace conflict is contained.
 *
 * This is the assembled-composition evidence for the service's Remote surface:
 * every call here goes through the same methods the web GUI invokes.
 */

import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve, join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type { Context } from '@deepseek-ai/cordis'
import type { PatchOptions } from '@deepseek-ai/cordis-plugin-include'
import { boot } from '@deepseek-ai/dsh-app-boot'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import FileSettingsProvider from '@deepseek-ai/dsh-settings-file'
import * as McpServers from '@deepseek-ai/dsh-mcp-servers/src/index.ts'
import * as McpClient from '@deepseek-ai/dsh-mcp-client/src/index.ts'
import type { McpServerDraft } from '@deepseek-ai/dsh-mcp-servers/src/types.ts'

const root = resolve(import.meta.dirname, '../../..')
const baseConfig = resolve(import.meta.dirname, 'fixtures/mcp-servers-base.cordis.yml')
const fixtureServer = resolve(root, 'packages/mcp/mcp-client/tests/fixture-server.ts')

const liveContexts = new Set<Context>()
const tempDirs: string[] = []

afterEach(async () => {
  await Promise.all([...liveContexts].map(async ctx => ctx.fiber.dispose()))
  liveContexts.clear()
  await Promise.all(tempDirs.splice(0).map(dir => rm(dir, { recursive: true, force: true })))
})

/** One new-server draft pointed at the keyless fixture server. */
function draft(overrides: Partial<McpServerDraft> = {}): McpServerDraft {
  return {
    serverName: 'memory-test',
    transport: 'stdio',
    command: process.execPath,
    args: [fixtureServer],
    cwd: root,
    ...overrides,
  }
}

/** Poll one condition until it holds or the budget runs out. */
async function waitFor(condition: () => boolean | Promise<boolean>, what: string): Promise<void> {
  const deadline = Date.now() + 20_000
  while (!await condition()) {
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${what}`)
    await new Promise(resolveWait => setTimeout(resolveWait, 25))
  }
}

/** Boot the roster over a scenario-local settings document. */
async function bootRoster(): Promise<{ ctx: Context; settingsPath: string }> {
  const dir = await mkdtemp(join(tmpdir(), 'dsh-mcp-servers-e2e-'))
  tempDirs.push(dir)
  const settingsPath = join(dir, 'settings.yaml')
  const ctx = await boot(
    'mcp-servers-config-test',
    baseConfig,
    [{ id: 'settings', config: { path: settingsPath, watch: false } } satisfies PatchOptions],
    (prepared) => {
      liveContexts.add(prepared)
      prepared.loader.builtins['memory-test-system-prompt'] = SystemPrompt
      prepared.loader.builtins['memory-test-tools'] = ToolRuntime
      prepared.loader.builtins['memory-test-settings'] = FileSettingsProvider
      prepared.loader.builtins['memory-test-mcp-servers'] = McpServers
    },
  )
  return { ctx, settingsPath }
}

describe('MCP server roster composition', () => {
  it('adds a server, mounts its tools, and removes it again', async () => {
    const { ctx } = await bootRoster()
    const roster = ctx.mcpServers

    const empty = await roster.list()
    expect(empty.servers).toEqual([])
    expect(empty.revision).toBe(0)

    const added = await roster.add(draft(), empty.revision)
    expect(added.servers[0]?.serverName).toBe('memory-test')

    await waitFor(() => ctx.tools.schemas().some(schema => schema.name === 'mcp__memory-test__greet'), 'the fixture tool')

    const removed = await roster.deleteServer(added.servers[0]?.id as string, added.revision)
    expect(removed.servers).toEqual([])
    await waitFor(() => !ctx.tools.schemas().some(schema => schema.name.startsWith('mcp__memory-test__')), 'the tool to unregister')

    // The namespace is released, so the same server can be added back.
    const readded = await roster.add(draft(), removed.revision)
    expect(readded.servers).toHaveLength(1)
    await waitFor(() => ctx.tools.schemas().some(schema => schema.name === 'mcp__memory-test__greet'), 'the tool after re-adding')
  }, 60_000)

  it('tests an unsaved draft without touching the tool catalog', async () => {
    const { ctx } = await bootRoster()
    const before = ctx.tools.schemas().map(schema => schema.name)

    const result = await ctx.mcpServers.testConnection({ draft: draft() }, new AbortController().signal)

    expect(result.ok).toBe(true)
    expect(result.tools).toContain('greet')
    expect(ctx.tools.schemas().map(schema => schema.name)).toEqual(before)
  }, 60_000)

  it('contains a namespace conflict without taking the composition down', async () => {
    const { ctx } = await bootRoster()
    // A deployment-owned row already holds this namespace at the same scope.
    await ctx.plugin(McpClient, {
      transport: 'stdio',
      serverName: 'memory-test',
      command: process.execPath,
      args: [fixtureServer],
      env: {},
      cwd: root,
      toolCallTimeoutMs: 5_000,
      failOnStartupError: false,
    })

    const added = await ctx.mcpServers.add(draft(), 0)
    const id = added.servers[0]?.id as string

    await waitFor(async () => (await ctx.mcpServers.list()).servers[0]?.mountError !== undefined, 'the mount failure')
    const listed = await ctx.mcpServers.list()
    expect(listed.servers[0]?.mounted).toBe(false)
    expect(listed.servers[0]?.mountError).toBeTruthy()

    // The unrelated foreign tools keep working; the composition itself is alive.
    expect(ctx.tools.schemas().some(schema => schema.name === 'mcp__memory-test__greet')).toBe(true)
    // Removing the conflicting entry leaves the foreign row untouched.
    const removed = await ctx.mcpServers.deleteServer(id, listed.revision)
    expect(removed.servers).toEqual([])
    expect(ctx.tools.schemas().some(schema => schema.name === 'mcp__memory-test__greet')).toBe(true)
  }, 60_000)

  it('persists the roster into the settings document', async () => {
    const { ctx, settingsPath } = await bootRoster()

    await ctx.mcpServers.add(draft(), 0)

    const document = await readFile(settingsPath, 'utf8')
    expect(document).toContain('serverName: memory-test')
    expect(document).toContain('transport: stdio')
  }, 60_000)
})
