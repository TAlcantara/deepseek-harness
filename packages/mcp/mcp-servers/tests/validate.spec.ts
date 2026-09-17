/**
 * Roster normalization and validation rules: the cross-field checks the
 * settings schema cannot express, plus the variable-level secret patch.
 */

import { describe, expect, it } from 'vitest'
import { RemoteError } from '@deepseek-ai/dsh-typert-protocol'
import type { McpServerEntry } from '../src/types.ts'
import type { McpServerPatch } from '../src/types.ts'
import { applyPatch, normalizeDraft, validateRoster } from '../src/validate.ts'

/** One complete stored entry; overrides apply last. */
function entry(overrides: Partial<McpServerEntry> = {}): McpServerEntry {
  return {
    id: 'srv-1',
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

/** Run one validation and return the failure it must produce. */
function failureOf(run: () => void): RemoteError {
  try {
    run()
  } catch (error: unknown) {
    return error as RemoteError
  }
  throw new Error('expected the call to fail')
}

describe('normalizeDraft', () => {
  it('defaults a stdio draft and drops the HTTP field set', () => {
    const fields = normalizeDraft({ serverName: 'srv', transport: 'stdio', command: 'node' })

    expect(fields).toMatchObject({
      serverName: 'srv',
      transport: 'stdio',
      command: 'node',
      args: [],
      cwd: '',
      env: {},
      enabled: true,
      label: '',
      toolCallTimeoutMs: 60_000,
      failOnStartupError: false,
      url: '',
      headers: {},
    })
    expect(fields).not.toHaveProperty('id')
    expect(fields).not.toHaveProperty('reconnect')
  })

  it('defaults an HTTP draft and drops the stdio field set', () => {
    const fields = normalizeDraft({
      serverName: 'srv',
      transport: 'streamable-http',
      url: 'https://example.test/mcp',
    })

    expect(fields).toMatchObject({
      transport: 'streamable-http',
      url: 'https://example.test/mcp',
      command: '',
      args: [],
      cwd: '',
      env: {},
      headers: {},
    })
  })

  it('leaves a stdio draft without a command empty', () => {
    expect(normalizeDraft({ serverName: 'srv', transport: 'stdio' })).toMatchObject({ command: '', args: [] })
  })

  it('leaves an HTTP draft without an endpoint empty', () => {
    expect(normalizeDraft({ serverName: 'srv', transport: 'streamable-http' })).toMatchObject({ url: '', headers: {} })
  })

  it('keeps supplied values and copies the caller arrays', () => {
    const args = ['-y', 'server']
    const env = { TOKEN: 'value' }
    const reconnect = { enabled: false }

    const fields = normalizeDraft({
      serverName: 'srv',
      transport: 'stdio',
      command: 'npx',
      args,
      env,
      cwd: '/tmp',
      label: 'Server',
      enabled: false,
      toolCallTimeoutMs: 1_000,
      failOnStartupError: true,
      reconnect,
    })

    expect(fields).toMatchObject({
      command: 'npx',
      args: ['-y', 'server'],
      env: { TOKEN: 'value' },
      cwd: '/tmp',
      label: 'Server',
      enabled: false,
      toolCallTimeoutMs: 1_000,
      failOnStartupError: true,
      reconnect: { enabled: false },
    })
    expect(fields.args).not.toBe(args)
    expect(fields.env).not.toBe(env)
    expect(fields.reconnect).not.toBe(reconnect)
  })
})

describe('applyPatch', () => {
  it('replaces scalar fields and leaves untouched ones alone', () => {
    const next = applyPatch(entry({ args: ['old'] }), {
      label: '新名字',
      args: ['new'],
      cwd: '/work',
      url: 'https://ignored.test',
      toolCallTimeoutMs: 2_000,
      failOnStartupError: true,
      reconnect: { enabled: false, maxAttempts: 3 },
    } satisfies McpServerPatch)

    expect(next).toMatchObject({
      label: '新名字',
      args: ['new'],
      cwd: '/work',
      toolCallTimeoutMs: 2_000,
      failOnStartupError: true,
      reconnect: { enabled: false, maxAttempts: 3 },
    })
    // Untouched fields keep their stored values.
    expect(next.serverName).toBe('fixture')
    expect(next.command).toBe('node')
  })

  it('merges env entries as set, remove, and keep', () => {
    const next = applyPatch(entry({ env: { KEEP: 'a', DROP: 'b' } }), {
      env: { KEEP: 'c', ADD: 'd', DROP: null },
    })

    expect(next.env).toEqual({ KEEP: 'c', ADD: 'd' })
  })

  it('merges header entries as set, remove, and keep', () => {
    const next = applyPatch(entry({ headers: { A: '1', B: '2' } }), {
      headers: { B: null, C: '3' },
    })

    expect(next.headers).toEqual({ A: '1', C: '3' })
  })

  it('unmounts the stdio field set when the transport switches to HTTP', () => {
    const next = applyPatch(
      entry({ transport: 'stdio', command: 'node', args: ['a'], cwd: '/work', env: { T: '1' } }),
      { transport: 'streamable-http', url: 'https://example.test/mcp' },
    )

    expect(next).toMatchObject({
      transport: 'streamable-http',
      url: 'https://example.test/mcp',
      command: '',
      args: [],
      cwd: '',
      env: {},
    })
  })

  it('unmounts the HTTP field set when the transport switches to stdio', () => {
    const next = applyPatch(
      entry({
        transport: 'streamable-http',
        url: 'https://example.test/mcp',
        headers: { A: '1' },
        command: '',
      }),
      { transport: 'stdio', command: 'node' },
    )

    expect(next).toMatchObject({ transport: 'stdio', command: 'node', url: '', headers: {} })
  })

  it('keeps the field set when the transport is restated unchanged', () => {
    const next = applyPatch(entry({ command: 'node' }), { transport: 'stdio' })

    expect(next.command).toBe('node')
  })

  it('does not mutate the stored entry', () => {
    const stored = entry({ env: { A: '1' } })
    applyPatch(stored, { env: { A: null }, label: 'changed' })

    expect(stored.env).toEqual({ A: '1' })
    expect(stored.label).toBe('')
  })
})

describe('validateRoster', () => {
  it('accepts a well-formed roster', () => {
    expect(() => {
      validateRoster([
        entry(),
        entry({ id: 'srv-2', serverName: 'other', transport: 'streamable-http', command: '', url: 'http://127.0.0.1:3000/mcp' }),
      ])
    }).not.toThrow()
  })

  it('accepts an empty roster', () => {
    expect(() => { validateRoster([]) }).not.toThrow()
  })

  it.each([
    ['id', { id: 'Bad_Id' }],
    ['serverName', { serverName: 'has space' }],
    ['serverName', { serverName: '' }],
    ['command', { command: '   ' }],
    ['url', { transport: 'streamable-http' as const, command: '', url: 'not-a-url' }],
    ['url', { transport: 'streamable-http' as const, command: '', url: 'ftp://example.test/x' }],
    ['env.BAD=NAME', { env: { 'BAD=NAME': 'v' } }],
    ['headers.BAD=NAME', { headers: { 'BAD=NAME': 'v' } }],
    ['toolCallTimeoutMs', { toolCallTimeoutMs: 0 }],
    ['toolCallTimeoutMs', { toolCallTimeoutMs: Number.NaN }],
    ['reconnect', { reconnect: { nope: true } as never }],
    ['reconnect.initialDelayMs', { reconnect: { initialDelayMs: -1 } }],
    ['reconnect.initialDelayMs', { reconnect: { initialDelayMs: 10, maxDelayMs: 5 } }],
    ['reconnect.maxDelayMs', { reconnect: { maxDelayMs: 0 } }],
    ['reconnect.maxAttempts', { reconnect: { maxAttempts: 0 } }],
    ['reconnect.maxAttempts', { reconnect: { maxAttempts: 1.5 } }],
  ])('rejects an invalid %s', (field, overrides) => {
    const failure = failureOf(() => { validateRoster([entry(overrides)]) })

    expect(failure.code).toBe('mcp/invalid-entry')
    expect(failure.details).toMatchObject({ field })
  })

  it('rejects two entries sharing one model-facing namespace', () => {
    const failure = failureOf(() => {
      validateRoster([
        entry(),
        entry({ id: 'srv-2' }),
      ])
    })

    expect(failure.code).toBe('mcp/duplicate-server-name')
    expect(failure.details).toMatchObject({ serverName: 'fixture' })
  })
})
