// @vitest-environment jsdom
/**
 * MCP settings section behavior: the roster row, the editor form, the
 * connectivity test, and the states a deployment can put the page in.
 */

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { RemoteError, bindSnapshotSelector } from '@deepseek-ai/dsh-client-test-runtime'
import type { RemoteFailure } from '@deepseek-ai/dsh-api-remotes/client'
import type {
  McpConnectionTest, McpServerDraft, McpServerPatch, McpServerSnapshot, McpServerView, McpTestTarget,
} from '@deepseek-ai/dsh-mcp-servers/types'
import { McpSection } from '../src/client/McpSection.tsx'
import { buildDraft, buildPatch, initialForm, parseAssignments, parseLines, parseTimeout, ServerEditor } from '../src/client/ServerEditor.tsx'
import { TestOutcome } from '../src/client/TestOutcome.tsx'
import { createMcpServersStore, type McpServersState } from '../src/client/store.ts'
import { createMcpServersOperations } from '../src/client/operations.ts'
import { en, type McpLocaleKey } from '../src/client/locales.ts'

afterEach(cleanup)

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
    label: 'Fixture',
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
function snapshot(servers: McpServerView[] = [view()]): McpServerSnapshot {
  return { servers, revision: 1, capabilities: { canEdit: true, testTimeoutMs: 15_000 } }
}

/** One Remote answer, as the generated client returns it. */
type Answer<T> = { ok: true; value: T } | { ok: false; error: RemoteFailure }

/** A Remote namespace stub whose answers the test can replace. */
function stubRemote() {
  return {
    list: vi.fn(async (): Promise<Answer<McpServerSnapshot>> => ({ ok: true, value: snapshot() })),
    add: vi.fn(async (_draft: McpServerDraft, _revision: number): Promise<Answer<McpServerSnapshot>> => ({ ok: true, value: snapshot() })),
    update: vi.fn(async (
      _id: string, _patch: McpServerPatch, _revision: number,
    ): Promise<Answer<McpServerSnapshot>> => ({ ok: true, value: snapshot() })),
    deleteServer: vi.fn(async (_id: string, _revision: number): Promise<Answer<McpServerSnapshot>> => ({ ok: true, value: snapshot([]) })),
    setEnabled: vi.fn(async (
      _id: string, _enabled: boolean, _revision: number,
    ): Promise<Answer<McpServerSnapshot>> => ({ ok: true, value: snapshot() })),
    testConnection: vi.fn(async (_target: McpTestTarget): Promise<Answer<McpConnectionTest>> => ({ ok: true, value: { ok: true, tools: ['greet'], at: 1, durationMs: 2 } })),
  }
}

/** Render the section over one store and stub Remote. */
function renderSection(seed?: (state: McpServersState) => void) {
  const remote = stubRemote()
  const store = createMcpServersStore()
  // Writable by default so a case exercises the row actions; a case that wants
  // a locked deployment overrides the capabilities itself.
  store.update((draft) => {
    draft.capabilities = { canEdit: true, testTimeoutMs: 15_000 }
    draft.revision = 1
    seed?.(draft)
  })
  const operations = createMcpServersOperations(remote, store, translate)
  const useSnapshot = bindSnapshotSelector(store)
  const rendered = render(<McpSection operations={operations} useSnapshot={useSnapshot} t={translate} />)
  return { remote, store, operations, rendered }
}

describe('McpSection', () => {
  it('renders nothing before the shell injects the face', () => {
    const { container } = render(<McpSection />)

    expect(container.textContent).toBe('')
  })

  it('loads the roster and shows the empty state', async () => {
    const remote = stubRemote()
    remote.list.mockResolvedValue({ ok: true, value: snapshot([]) })
    const store = createMcpServersStore()
    const operations = createMcpServersOperations(remote, store, translate)

    render(<McpSection operations={operations} useSnapshot={bindSnapshotSelector(store)} t={translate} />)

    expect(screen.getByText(en['loading'])).toBeDefined()
    await screen.findByText(en['empty.title'])
    expect(screen.getByText(en['empty.hint'])).toBeDefined()
    expect(remote.list).toHaveBeenCalledTimes(1)
  })

  it('renders one row with its identity, state, and test outcome', async () => {
    renderSection((state) => {
      state.status = 'ready'
      state.servers = [view({ mountError: 'namespace taken' })]
      state.capabilities = { canEdit: true, testTimeoutMs: 15_000 }
    })

    expect(screen.getByText('Fixture')).toBeDefined()
    expect(screen.getByText('fixture')).toBeDefined()
    expect(screen.getByText(en['transport.stdio'])).toBeDefined()
    expect(screen.getByText('node')).toBeDefined()
    expect(screen.getByText(en['state.enabled'])).toBeDefined()
    expect(screen.getByText(translate('state.mountError', { reason: 'namespace taken' }))).toBeDefined()
    expect(screen.getByText(en['test.untested'])).toBeDefined()
  })

  it('falls back to the namespace for a row without a display name', () => {
    renderSection((state) => {
      state.status = 'ready'
      state.servers = [view({ label: '', transport: 'streamable-http', url: 'http://127.0.0.1:9/mcp' })]
    })

    expect(screen.getByText(en['transport.http'])).toBeDefined()
    expect(screen.getByText('http://127.0.0.1:9/mcp')).toBeDefined()
  })

  it('tests a saved row with the entry it derives from', async () => {
    const { remote } = renderSection((state) => {
      state.status = 'ready'
      state.servers = [view()]
    })

    fireEvent.click(screen.getByRole('button', { name: en['test.action'] }))

    await waitFor(() => { expect(remote.testConnection).toHaveBeenCalledTimes(1) })
    expect(remote.testConnection.mock.calls[0]?.[0]).toMatchObject({ basedOn: 'srv-1', draft: { serverName: 'fixture' } })
    await screen.findByText(en['test.ok'].replace('{count}', '1'))
  })

  it('toggles a saved row', async () => {
    const { remote } = renderSection((state) => {
      state.status = 'ready'
      state.servers = [view()]
    })

    fireEvent.click(screen.getByRole('switch', { name: en['state.enabled'] }))

    await waitFor(() => { expect(remote.setEnabled).toHaveBeenCalledWith('srv-1', false, 1) })
  })

  it('removes a row only after its confirmation', async () => {
    const { remote } = renderSection((state) => {
      state.status = 'ready'
      state.servers = [view()]
    })

    fireEvent.click(screen.getByRole('button', { name: en['action.remove'] }))
    expect(screen.getByText(en['confirm.remove'])).toBeDefined()
    expect(remote.deleteServer).not.toHaveBeenCalled()

    const confirm = screen.getAllByRole('button', { name: en['action.remove'] })
    fireEvent.click(confirm[confirm.length - 1] as HTMLElement)

    await waitFor(() => { expect(remote.deleteServer).toHaveBeenCalledWith('srv-1', 1) })
    expect(screen.queryByText(en['confirm.remove'])).toBeNull()
  })

  it('cancels a removal confirmation', () => {
    renderSection((state) => {
      state.status = 'ready'
      state.servers = [view()]
    })

    fireEvent.click(screen.getByRole('button', { name: en['action.remove'] }))
    fireEvent.click(screen.getByRole('button', { name: en['action.cancel'] }))

    expect(screen.queryByText(en['confirm.remove'])).toBeNull()
  })

  it('hides every write control in a read-only deployment', () => {
    renderSection((state) => {
      state.status = 'ready'
      state.servers = [view({ enabled: false })]
      state.capabilities = { canEdit: false, testTimeoutMs: 15_000 }
      state.notice = en['save.saved']
    })

    expect(screen.getByText(en['state.disabled'])).toBeDefined()
    expect(screen.queryByRole('button', { name: en['add'] })).toBeNull()
    expect(screen.queryByRole('button', { name: en['action.edit'] })).toBeNull()
    expect(screen.queryByRole('button', { name: en['action.remove'] })).toBeNull()
    expect(screen.getByRole('switch', { name: en['state.enabled'] }).hasAttribute('disabled')).toBe(true)
    expect(screen.getByRole('button', { name: en['test.action'] })).toBeDefined()
  })

  it('dismisses the post-write notice', () => {
    renderSection((state) => {
      state.status = 'ready'
      state.servers = [view()]
      state.notice = en['save.saved']
    })

    expect(screen.getByText(en['save.saved'])).toBeDefined()
    fireEvent.click(screen.getByRole('button', { name: en['action.cancel'] }))
    expect(screen.queryByText(en['save.saved'])).toBeNull()
  })

  it('reports a failed load and retries', async () => {
    const remote = stubRemote()
    remote.list
      .mockResolvedValueOnce({ ok: false, error: new RemoteError('mcp/not-editable', 'read-only', {}) })
      .mockResolvedValue({ ok: true, value: snapshot([]) })
    const store = createMcpServersStore()
    const operations = createMcpServersOperations(remote, store, translate)

    render(<McpSection operations={operations} useSnapshot={bindSnapshotSelector(store)} t={translate} />)

    await screen.findByText(en['error.notEditable'])
    fireEvent.click(screen.getByRole('button', { name: en['retry'] }))
    await screen.findByText(en['empty.title'])
  })

  it('opens the blank editor and saves a new server', async () => {
    const { remote } = renderSection((state) => {
      state.status = 'ready'
      state.capabilities = { canEdit: true, testTimeoutMs: 15_000 }
    })

    fireEvent.click(screen.getByRole('button', { name: en['add'] }))
    fireEvent.change(screen.getByLabelText(en['field.serverName']), { target: { value: 'second' } })
    fireEvent.change(screen.getByLabelText(en['field.command']), { target: { value: 'node' } })
    fireEvent.click(screen.getByRole('button', { name: en['action.save'] }))

    await waitFor(() => { expect(remote.add).toHaveBeenCalledTimes(1) })
    expect(remote.add.mock.calls[0]?.[0]).toMatchObject({ serverName: 'second', command: 'node', transport: 'stdio' })
  })

  it('edits one server and patches only what the form changed', async () => {
    const { remote } = renderSection((state) => {
      state.status = 'ready'
      state.servers = [view({ envKeys: ['TOKEN'] })]
    })

    fireEvent.click(screen.getByRole('button', { name: en['action.edit'] }))
    expect(screen.getByLabelText(en['field.serverName'])).toHaveProperty('disabled', true)
    fireEvent.change(screen.getByLabelText(en['field.label']), { target: { value: 'Renamed' } })
    fireEvent.click(screen.getByRole('checkbox', { name: 'TOKEN' }))
    fireEvent.click(screen.getByRole('button', { name: en['action.save'] }))

    await waitFor(() => { expect(remote.update).toHaveBeenCalledTimes(1) })
    expect(remote.update.mock.calls[0]?.[1]).toMatchObject({ label: 'Renamed', env: { TOKEN: null } })
  })

  it('tests the editor draft through the section', async () => {
    const { remote, rendered } = renderSection((state) => {
      state.status = 'ready'
      state.servers = [view()]
    })

    fireEvent.click(screen.getByRole('button', { name: en['action.edit'] }))
    const form = rendered.container.querySelector('form') as HTMLElement
    fireEvent.click(within(form).getByRole('button', { name: en['test.action'] }))

    await waitFor(() => { expect(remote.testConnection).toHaveBeenCalledTimes(1) })
    expect(remote.testConnection.mock.calls[0]?.[0]).toMatchObject({ basedOn: 'srv-1' })
    await screen.findByText(en['test.ok'].replace('{count}', '1'))
  })

  it('closes the editor without writing', () => {
    const { remote } = renderSection((state) => {
      state.status = 'ready'
      state.servers = [view()]
    })

    fireEvent.click(screen.getByRole('button', { name: en['action.edit'] }))
    fireEvent.click(screen.getByRole('button', { name: en['action.cancel'] }))

    expect(screen.queryByLabelText(en['field.serverName'])).toBeNull()
    expect(remote.update).not.toHaveBeenCalled()
  })
})

describe('TestOutcome', () => {
  /** Render one outcome. */
  function renderOutcome(state: Parameters<typeof TestOutcome>[0]['state']) {
    render(<TestOutcome state={state} t={translate} />)
  }

  it('renders running, untested, both successes, and both failures', () => {
    renderOutcome({ phase: 'running' })
    expect(screen.getByText(en['test.running'])).toBeDefined()

    cleanup()
    renderOutcome({ phase: 'idle' })
    expect(screen.getByText(en['test.untested'])).toBeDefined()

    cleanup()
    renderOutcome({ phase: 'done', result: { ok: true, tools: ['a', 'b'], at: 1, durationMs: 2 } })
    expect(screen.getByText(translate('test.ok', { count: 2 }))).toBeDefined()

    cleanup()
    renderOutcome({ phase: 'done', result: { ok: true, tools: [], at: 1, durationMs: 2 } })
    expect(screen.getByText(en['test.ok.none'])).toBeDefined()

    cleanup()
    renderOutcome({ phase: 'done', result: { ok: false, tools: [], error: 'boom', at: 1, durationMs: 2 } })
    expect(screen.getByRole('status').textContent).toBe(translate('test.failed', { reason: 'boom' }))

    cleanup()
    renderOutcome({ phase: 'done', result: { ok: false, tools: [], at: 1, durationMs: 2 } })
    expect(screen.getByRole('status').textContent).toBe(translate('test.failed', { reason: '' }))
  })
})

describe('ServerEditor form rules', () => {
  /** Render the editor alone with the given mode and seed. */
  function renderEditor(mode: 'add' | 'edit', initial?: McpServerView) {
    const onSaveAdd = vi.fn(async (_draft: McpServerDraft) => true)
    const onSaveEdit = vi.fn(async (_id: string, _patch: McpServerPatch) => true)
    const onTest = vi.fn<(target: McpTestTarget) => void>()
    const onClose = vi.fn()
    const rendered = render(
      <ServerEditor
        mode={mode}
        {...initial === undefined ? {} : { initial }}
        writeError={mode === 'add' ? 'rejected' : ''}
        testState={{ phase: 'done', result: { ok: false, tools: [], error: 'boom', at: 1, durationMs: 2 } }}
        t={translate}
        onSaveAdd={onSaveAdd}
        onSaveEdit={onSaveEdit}
        onTest={onTest}
        onClose={onClose}
      />,
    )
    return { onSaveAdd, onSaveEdit, onTest, onClose, rendered }
  }

  it('parses assignments, lines, and the timeout field', () => {
    expect(parseAssignments('A=1\nB = two\nbroken\n=skip')).toEqual({ A: '1', B: 'two' })
    expect(parseLines(' a \n\n b ')).toEqual(['a', 'b'])
    expect(parseTimeout(' 2500 ')).toBe(2500)
    expect(parseTimeout('0')).toBeUndefined()
    expect(parseTimeout('soon')).toBeUndefined()
    expect(parseTimeout('')).toBeUndefined()
  })

  it('seeds a blank form from the bridge defaults', () => {
    expect(initialForm()).toMatchObject({
      serverName: '', label: '', transport: 'stdio', args: '', timeout: '60000', envRemove: [], headersRemove: [],
    })
  })

  it('builds a stdio draft and an HTTP draft', () => {
    expect(buildDraft({ ...initialForm(), serverName: ' srv ', command: ' node ', args: '-y\npkg', envAdd: 'A=1' }, 1_000))
      .toMatchObject({ serverName: 'srv', command: 'node', args: ['-y', 'pkg'], env: { A: '1' } })
    expect(buildDraft({ ...initialForm(), serverName: 'srv', transport: 'streamable-http', url: ' http://x/mcp ' }, 1_000))
      .toMatchObject({ transport: 'streamable-http', url: 'http://x/mcp', headers: {} })
  })

  it('builds an edit patch from removals, additions, and the transport field set', () => {
    const stdio = buildPatch({
      ...initialForm(),
      envRemove: ['DROP'],
      envAdd: 'ADD=1',
      headersRemove: ['H'],
      headersAdd: 'G=2',
      command: 'node',
      args: 'a',
      cwd: '/work',
    }, 2_000)
    expect(stdio).toEqual({
      label: '',
      transport: 'stdio',
      toolCallTimeoutMs: 2_000,
      env: { DROP: null, ADD: '1' },
      headers: { H: null, G: '2' },
      command: 'node',
      args: ['a'],
      cwd: '/work',
    })

    const http = buildPatch({ ...initialForm(), transport: 'streamable-http', url: 'http://x/mcp' }, 2_000)
    expect(http).toMatchObject({ transport: 'streamable-http', url: 'http://x/mcp' })
    expect(http.command).toBeUndefined()
  })

  it('shows the HTTP field set and blocks an unusable timeout', () => {
    const { onSaveAdd } = renderEditor('add')

    fireEvent.change(screen.getByLabelText(en['field.transport']), { target: { value: 'streamable-http' } })
    expect(screen.getByLabelText(en['field.url'])).toBeDefined()
    expect(screen.queryByLabelText(en['field.command'])).toBeNull()

    fireEvent.change(screen.getByLabelText(en['field.serverName']), { target: { value: 'second' } })
    fireEvent.change(screen.getByLabelText(en['field.timeout']), { target: { value: 'soon' } })
    expect(screen.getByRole('button', { name: en['action.save'] }).hasAttribute('disabled')).toBe(true)
    expect(screen.getByRole('button', { name: en['test.action'] }).hasAttribute('disabled')).toBe(true)
    expect(onSaveAdd).not.toHaveBeenCalled()

    fireEvent.change(screen.getByLabelText(en['field.timeout']), { target: { value: '5000' } })
    expect(screen.getByRole('button', { name: en['action.save'] }).hasAttribute('disabled')).toBe(false)
  })

  it('round-trips every field the form owns', async () => {
    const { onSaveAdd } = renderEditor('add')

    fireEvent.change(screen.getByLabelText(en['field.serverName']), { target: { value: 'second' } })
    fireEvent.change(screen.getByLabelText(en['field.args']), { target: { value: 'a\nb' } })
    fireEvent.change(screen.getByLabelText(en['field.cwd']), { target: { value: '/work' } })
    fireEvent.change(screen.getByLabelText(en['secret.add']), { target: { value: 'A=1' } })

    fireEvent.change(screen.getByLabelText(en['field.transport']), { target: { value: 'streamable-http' } })
    fireEvent.change(screen.getByLabelText(en['field.url']), { target: { value: 'http://x/mcp' } })
    fireEvent.change(screen.getByLabelText(en['secret.add']), { target: { value: 'H=2' } })
    fireEvent.change(screen.getByLabelText(en['field.transport']), { target: { value: 'stdio' } })

    fireEvent.click(screen.getByRole('button', { name: en['action.save'] }))

    await waitFor(() => { expect(onSaveAdd).toHaveBeenCalledTimes(1) })
    expect(onSaveAdd.mock.calls[0]?.[0]).toMatchObject({
      serverName: 'second', args: ['a', 'b'], cwd: '/work', env: { A: '1' },
    })
    expect(onSaveAdd.mock.calls[0]?.[0]).not.toHaveProperty('url')
  })

  it('unmarks a secret the user marked for removal', () => {
    renderEditor('edit', view({ envKeys: ['TOKEN'] }))

    fireEvent.click(screen.getByRole('checkbox', { name: 'TOKEN' }))
    expect(screen.getByRole('checkbox', { name: 'TOKEN' })).toHaveProperty('checked', true)
    fireEvent.click(screen.getByRole('checkbox', { name: 'TOKEN' }))
    expect(screen.getByRole('checkbox', { name: 'TOKEN' })).toHaveProperty('checked', false)
  })

  it('ignores a submit that arrives while the timeout is unusable', () => {
    const { onSaveAdd, rendered } = renderEditor('add')

    fireEvent.change(screen.getByLabelText(en['field.serverName']), { target: { value: 'second' } })
    fireEvent.change(screen.getByLabelText(en['field.timeout']), { target: { value: 'soon' } })
    const form = rendered.container.querySelector('form') as HTMLElement
    fireEvent.submit(form)

    expect(onSaveAdd).not.toHaveBeenCalled()
  })

  it('tests an edit draft with the saved entry behind it', () => {
    const { onTest } = renderEditor('edit', view())

    fireEvent.click(screen.getByRole('button', { name: en['test.action'] }))

    const target = onTest.mock.calls[0]?.[0]
    expect(target).toMatchObject({ basedOn: 'srv-1', draft: { serverName: 'fixture' } })
  })

  it('reports the form failure and the test outcome it was given', () => {
    renderEditor('add')

    expect(screen.getByRole('alert').textContent).toBe('rejected')
    expect(screen.getByText(translate('test.failed', { reason: 'boom' }))).toBeDefined()
  })

  it('saves an added draft and closes when the write lands', async () => {
    const { onSaveAdd, onClose } = renderEditor('add')

    fireEvent.change(screen.getByLabelText(en['field.serverName']), { target: { value: 'second' } })
    fireEvent.click(screen.getByRole('button', { name: en['action.save'] }))

    await waitFor(() => { expect(onSaveAdd).toHaveBeenCalledTimes(1) })
    await waitFor(() => { expect(onClose).toHaveBeenCalledTimes(1) })
  })

  it('keeps the editor open when the write was refused', async () => {
    const onSaveAdd = vi.fn(async (_draft: McpServerDraft) => false)
    render(
      <ServerEditor
        mode="add"
        writeError=""
        testState={{ phase: 'idle' }}
        t={translate}
        onSaveAdd={onSaveAdd}
        onSaveEdit={vi.fn(async () => true)}
        onTest={vi.fn()}
        onClose={vi.fn()}
      />,
    )

    fireEvent.change(screen.getByLabelText(en['field.serverName']), { target: { value: 'second' } })
    fireEvent.click(screen.getByRole('button', { name: en['action.save'] }))

    await waitFor(() => { expect(onSaveAdd).toHaveBeenCalledTimes(1) })
    expect(screen.getByLabelText(en['field.serverName'])).toBeDefined()
  })

  it('tests an added draft without a saved entry behind it', () => {
    const { onTest } = renderEditor('add')

    fireEvent.change(screen.getByLabelText(en['field.serverName']), { target: { value: 'second' } })
    fireEvent.click(screen.getByRole('button', { name: en['test.action'] }))

    const target = onTest.mock.calls[0]?.[0]
    expect(target).toMatchObject({ draft: { serverName: 'second' } })
    expect(target).not.toHaveProperty('basedOn')
  })

  it('saves an edit as a patch', async () => {
    const { onSaveEdit } = renderEditor('edit', view({ label: 'Fixture' }))

    fireEvent.change(screen.getByLabelText(en['field.label']), { target: { value: 'Renamed' } })
    fireEvent.click(screen.getByRole('button', { name: en['action.save'] }))

    await waitFor(() => { expect(onSaveEdit).toHaveBeenCalledWith('srv-1', expect.objectContaining({ label: 'Renamed' })) })
  })

  it('lists stored secrets as removable and reports when there are none', () => {
    renderEditor('edit', view({ envKeys: [] }))
    expect(screen.getAllByText(en['secret.none']).length).toBeGreaterThan(0)

    cleanup()
    renderEditor('edit', view({ envKeys: ['TOKEN'] }))
    fireEvent.click(screen.getByRole('checkbox', { name: 'TOKEN' }))
    expect(screen.getByRole('checkbox', { name: 'TOKEN' })).toHaveProperty('checked', true)

    cleanup()
    renderEditor('edit', view({ transport: 'streamable-http', headerKeys: ['Authorization'] }))
    expect(screen.getByRole('checkbox', { name: 'Authorization' })).toBeDefined()
  })
})
