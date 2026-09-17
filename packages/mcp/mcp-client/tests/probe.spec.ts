/**
 * Tests for {@link probeConnection}: the one-shot, side-effect-free
 * connectivity probe the settings surface uses in place of live status.
 *
 * These tests use the real MCP SDK against real child processes, so they
 * cover the transport, the scrub, and the close path the bridge also uses.
 */

import { existsSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import { apply } from '../src/index.ts'
import type { Config } from '../src/index.ts'
import { probeConnection } from '../src/probe.ts'

const packageDir = fileURLToPath(new URL('..', import.meta.url))
const fixtureServerPath = fileURLToPath(new URL('./fixture-server.ts', import.meta.url))
const hangingServerPath = fileURLToPath(new URL('./fixtures/hanging-server.ts', import.meta.url))

const tempDirs: string[] = []

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map(dir => rm(dir, { recursive: true, force: true })))
})

/** Build one stdio config pointed at a fixture entry point. */
function stdioConfig(
  serverName: string,
  overrides: { command?: string; args?: string[] } = {},
): Config {
  return {
    transport: 'stdio',
    serverName,
    command: overrides.command ?? process.execPath,
    args: overrides.args ?? [fixtureServerPath],
    env: {},
    cwd: packageDir,
    toolCallTimeoutMs: 5_000,
    failOnStartupError: false,
  }
}

/** One private temporary directory owned by the current test. */
async function tempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'dsh-mcp-probe-'))
  tempDirs.push(dir)
  return dir
}

describe('probeConnection', () => {
  it('lists the server tools and closes the transport', async () => {
    const result = await probeConnection(stdioConfig('probe-success'))

    expect(result.ok).toBe(true)
    expect(result.tools).toContain('greet')
    expect(result.tools).toContain('add')
    expect(result.error).toBeUndefined()
  }, 30_000)

  it('reports a spawn failure without throwing', async () => {
    const result = await probeConnection(stdioConfig('probe-missing', {
      command: join(tmpdir(), 'dsh-mcp-probe-absent-binary'),
    }))

    expect(result.ok).toBe(false)
    expect(result.tools).toEqual([])
    expect(result.error).toBeTruthy()
  }, 30_000)

  it('times out on an unresponsive server and terminates it', async () => {
    const dir = await tempDir()
    const exitMarker = join(dir, 'closed')

    const result = await probeConnection(
      stdioConfig('probe-timeout', { args: [hangingServerPath, join(dir, 'pid'), exitMarker] }),
      { timeoutMs: 400 },
    )

    expect(result.ok).toBe(false)
    expect(result.error).toBe('timed out after 400ms')
    await expect.poll(() => existsSync(exitMarker), { timeout: 15_000 }).toBe(true)
  }, 30_000)

  it('reports caller cancellation distinctly from a timeout', async () => {
    const controller = new AbortController()
    setTimeout(() => { controller.abort() }, 100)

    const result = await probeConnection(
      stdioConfig('probe-cancel', { args: [hangingServerPath] }),
      { timeoutMs: 30_000, signal: controller.signal },
    )

    expect(result.ok).toBe(false)
    expect(result.error).toBe('canceled')
  }, 30_000)

  it('times out while an unaborted caller signal is attached', async () => {
    const result = await probeConnection(
      stdioConfig('probe-timeout-signal', { args: [hangingServerPath] }),
      { timeoutMs: 400, signal: new AbortController().signal },
    )

    expect(result.ok).toBe(false)
    expect(result.error).toBe('timed out after 400ms')
  }, 30_000)

  it('probes a mounted server without reserving its name or touching the tool registry', async () => {
    const ctx = new Context()
    await ctx.plugin(SystemPrompt)
    await ctx.plugin(ToolRuntime)
    await apply(ctx, stdioConfig('probe-shared'))
    try {
      const registered = ctx.tools.schemas().map(schema => schema.name)
      expect(registered).toContain('mcp__probe-shared__greet')

      // The mounted bridge already reserved `probe-shared`; a probe that
      // reserved it again would fail here instead of answering.
      const result = await probeConnection(stdioConfig('probe-shared'))

      expect(result.ok).toBe(true)
      expect(result.tools).toContain('greet')
      expect(ctx.tools.schemas().map(schema => schema.name)).toEqual(registered)
    } finally {
      await ctx.fiber.dispose()
    }
  }, 30_000)
})
