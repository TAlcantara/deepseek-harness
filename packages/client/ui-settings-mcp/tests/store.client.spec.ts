/**
 * Page state and wire operations: what each Remote answer folds into the
 * store, which failure code becomes which copy, and the editor transitions.
 */

import { describe, expect, it, vi } from 'vitest'
import { RemoteError } from '@deepseek-ai/dsh-client-test-runtime'
import type { McpServerSnapshot, McpServerView } from '@deepseek-ai/dsh-mcp-servers/types'
import { createMcpServersOperations } from '../src/client/operations.ts'
import { en, type McpLocaleKey } from '../src/client/locales.ts'
import { createMcpServersStore, DRAFT_KEY, testStateOf } from '../src/client/store.ts'

/** Render copy with `{name}` placeholders substituted, like the locale seat. */
function translate(key: McpLocaleKey, params?: Record<string, string | number>): string {
  return Object.entries(params ?? {})
    .reduce((text, [name, value]) => text.replaceAll(`{${name}}`, String(value)), en[key])
}

/** One saved server as the page reads it. */
function view(overrides: Partial<McpServerView> = {}): McpServerView {
  return {
    id: 'srv-1',
    serverName: 'fixture',
    enabled: true,
    label: '',
    transport: 'stdio',
    command: 'node',
    args: [],
    cwd: '',
    envKeys: [],
    url: '',
    headerKeys: [],
    toolCallTimeoutMs: 60_000,
    failOnStartupError: false,
    mounted: true,
    ...overrides,
  }
}

/** One complete roster answer. */
function snapshot(servers: McpServerView[] = [view()], revision = 1): McpServerSnapshot {
  return { servers, revision, capabilities: { canEdit: true, testTimeoutMs: 15_000 } }
}

/** A Remote namespace stub over one answer per method. */
function stubRemote(answers: Partial<Record<'list' | 'add' | 'update' | 'deleteServer' | 'setEnabled' | 'testConnection', unknown>>) {
  const answer = (name: keyof typeof answers): unknown => answers[name] ?? { ok: true, value: snapshot() }
  return {
    list: vi.fn(async () => await answer('list')),
    add: vi.fn(async () => await answer('add')),
    update: vi.fn(async () => await answer('update')),
    deleteServer: vi.fn(async () => await answer('deleteServer')),
    setEnabled: vi.fn(async () => await answer('setEnabled')),
    testConnection: vi.fn(async () => await answer('testConnection')),
  }
}

/** Boot the store and operations over one remote stub. */
function bench(answers: Parameters<typeof stubRemote>[0] = {}) {
  const remote = stubRemote(answers)
  const store = createMcpServersStore()
  const operations = createMcpServersOperations(remote as never, store, translate)
  return { remote, store, operations }
}

describe('page store helpers', () => {
  it('reports an untested target until one is recorded', () => {
    const store = createMcpServersStore()

    expect(testStateOf(store.getSnapshot(), 'srv-1')).toEqual({ phase: 'idle' })
    store.update((draft) => { draft.tests[DRAFT_KEY] = { phase: 'running' } })
    expect(testStateOf(store.getSnapshot(), DRAFT_KEY)).toEqual({ phase: 'running' })
  })
})

describe('roster operations', () => {
  it('loads the roster once', async () => {
    const { remote, store, operations } = bench()

    await operations.load()
    await operations.load()

    expect(remote.list).toHaveBeenCalledTimes(1)
    expect(store.getSnapshot()).toMatchObject({ status: 'ready', revision: 1, servers: [view()] })
  })

  it('reloads regardless of the current status', async () => {
    const { remote, operations } = bench()

    await operations.reload()
    await operations.reload()

    expect(remote.list).toHaveBeenCalledTimes(2)
  })

  it('reports a load failure and retries through reload', async () => {
    const { remote, store, operations } = bench({
      list: { ok: false, error: new RemoteError('mcp/not-editable', 'read-only', {}) },
    })

    await operations.load()

    expect(store.getSnapshot().status).toBe('failed')
    expect(store.getSnapshot().loadError).toBe(en['error.notEditable'])

    remote.list.mockResolvedValueOnce({ ok: true, value: snapshot() })
    await operations.reload()
    expect(store.getSnapshot()).toMatchObject({ status: 'ready', loadError: '' })
  })

  it('adds a server at the revision it read and announces the write', async () => {
    const { remote, store, operations } = bench()
    await operations.load()

    const saved = await operations.add({ serverName: 'second', transport: 'stdio', command: 'node' })

    expect(saved).toBe(true)
    expect(remote.add).toHaveBeenCalledWith({ serverName: 'second', transport: 'stdio', command: 'node' }, 1)
    expect(store.getSnapshot().notice).toBe(en['save.saved'])
  })

  it('keeps the editor open and reports a rejected write', async () => {
    const { store, operations } = bench({
      add: { ok: false, error: new RemoteError('mcp/duplicate-server-name', 'taken', { serverName: 'fixture' }) },
    })
    await operations.load()

    const saved = await operations.add({ serverName: 'fixture', transport: 'stdio', command: 'node' })

    expect(saved).toBe(false)
    expect(store.getSnapshot().writeError).toBe('The namespace fixture is already taken.')
    expect(store.getSnapshot().notice).toBe('')
  })

  it('edits one server at the revision it read', async () => {
    const { remote, operations } = bench()
    await operations.load()

    await operations.update('srv-1', { label: 'Renamed' })

    expect(remote.update).toHaveBeenCalledWith('srv-1', { label: 'Renamed' }, 1)
  })

  it('removes a server, clearing its confirmation and its cached test', async () => {
    const { remote, store, operations } = bench({ deleteServer: { ok: true, value: snapshot([]) } })
    await operations.load()
    store.update((draft) => { draft.pendingRemove = 'srv-1'; draft.tests['srv-1'] = { phase: 'running' } })

    await operations.remove('srv-1')

    expect(remote.deleteServer).toHaveBeenCalledWith('srv-1', 1)
    expect(store.getSnapshot().pendingRemove).toBe('')
    expect(store.getSnapshot().tests['srv-1']).toBeUndefined()
    expect(store.getSnapshot().servers).toEqual([])
  })

  it('keeps the confirmation when the removal failed', async () => {
    const { store, operations } = bench({ deleteServer: { ok: false, error: new RemoteError('mcp/unknown-server', 'gone', { id: 'srv-1' }) } })
    await operations.load()
    store.update((draft) => { draft.pendingRemove = 'srv-1' })

    await operations.remove('srv-1')

    expect(store.getSnapshot().pendingRemove).toBe('srv-1')
    expect(store.getSnapshot().writeError).toBe(en['error.unknownServer'])
  })

  it('toggles one server at the revision it read', async () => {
    const { remote, operations } = bench()
    await operations.load()

    await operations.setEnabled('srv-1', false)

    expect(remote.setEnabled).toHaveBeenCalledWith('srv-1', false, 1)
  })

  it.each([
    ['mcp/stale-revision', new RemoteError('mcp/stale-revision', 'moved', { expected: 1, actual: 2 }), en['error.staleRevision']],
    ['mcp/not-editable', new RemoteError('mcp/not-editable', 'read-only', {}), en['error.notEditable']],
    ['mcp/duplicate-server-name', new RemoteError('mcp/duplicate-server-name', 'taken', { serverName: 'x' }), translate('error.duplicateServerName', { name: 'x' })],
    ['mcp/invalid-entry', new RemoteError('mcp/invalid-entry', 'bad', { field: 'command', reason: 'missing' }), translate('error.invalidEntry', { field: 'command', reason: 'missing' })],
    ['mcp/unknown-server', new RemoteError('mcp/unknown-server', 'gone', { id: 'srv-1' }), en['error.unknownServer']],
    ['mcp/immutable-server-name', new RemoteError('mcp/immutable-server-name', 'fixed', { serverName: 'x' }), translate('error.generic', { message: 'fixed' })],
  ])('turns %s into page copy', async (_code, error, expected) => {
    const { store, operations } = bench({ add: { ok: false, error } })
    await operations.load()

    await operations.add({ serverName: 'fixture', transport: 'stdio', command: 'node' })

    expect(store.getSnapshot().writeError).toBe(expected)
  })

  it('records a successful connectivity test under the requested key', async () => {
    const { store, operations } = bench({
      testConnection: { ok: true, value: { ok: true, tools: ['greet'], at: 5, durationMs: 3 } },
    })

    await operations.test({ draft: { serverName: 'fixture', transport: 'stdio', command: 'node' } }, DRAFT_KEY)

    expect(store.getSnapshot().tests[DRAFT_KEY]).toEqual({
      phase: 'done',
      result: { ok: true, tools: ['greet'], at: 5, durationMs: 3 },
    })
  })

  it('records a rejected test as a failed outcome rather than a write error', async () => {
    const { store, operations } = bench({
      testConnection: { ok: false, error: new RemoteError('mcp/unknown-server', 'gone', { id: 'srv-1' }) },
    })

    await operations.test({ draft: { serverName: 'fixture', transport: 'stdio', command: 'node' }, basedOn: 'srv-1' }, 'srv-1')

    expect(store.getSnapshot().tests['srv-1']).toMatchObject({ phase: 'done', result: { ok: false, error: en['error.unknownServer'] } })
    expect(store.getSnapshot().writeError).toBe('')
  })

  it('drives the editor transitions', () => {
    const { store, operations } = bench()

    operations.openAdd()
    expect(store.getSnapshot().editor).toEqual({ mode: 'add' })
    operations.openEdit('srv-1')
    expect(store.getSnapshot().editor).toEqual({ mode: 'edit', id: 'srv-1' })
    store.update((draft) => { draft.writeError = 'stale'; draft.tests[DRAFT_KEY] = { phase: 'running' } })
    operations.closeEditor()
    expect(store.getSnapshot().editor).toEqual({ mode: 'closed' })
    expect(store.getSnapshot().writeError).toBe('')
    expect(store.getSnapshot().tests[DRAFT_KEY]).toBeUndefined()

    operations.askRemove('srv-1')
    expect(store.getSnapshot().pendingRemove).toBe('srv-1')
    operations.cancelRemove()
    expect(store.getSnapshot().pendingRemove).toBe('')

    store.update((draft) => { draft.notice = en['save.saved'] })
    operations.dismissNotice()
    expect(store.getSnapshot().notice).toBe('')
  })
})
