/**
 * MCP server roster service: one settings-namespaced list of external servers,
 * reconciled into `dsh-mcp-client` instances, with a connectivity test the
 * configuration surface drives on demand.
 *
 * The settings document is the single source of truth; the mounted bridges are
 * derived from it, so every write persists first and lets the watcher converge
 * the live set.
 *
 * @module @deepseek-ai/dsh-mcp-servers
 */

import { randomUUID } from 'node:crypto'
import type { Context } from '@deepseek-ai/cordis'
import type { SettingsScope } from '@deepseek-ai/dsh-settings'
import * as McpClient from '@deepseek-ai/dsh-mcp-client'
import z from '@deepseek-ai/schemastery'
import { Remote, RemoteError, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import { McpProbe } from './probe.ts'
import { explicitReconnect, MCP_SETTINGS_NAMESPACE, McpServerEntrySchema, McpSettingsSchema } from './settings.ts'
import { McpSupervisor } from './supervisor.ts'
import { applyPatch, normalizeDraft, validateRoster } from './validate.ts'
import type {
  McpCapabilities, McpConnectionTest, McpServerDraft, McpServerEntry, McpServerFields,
  McpServerPatch, McpServerSnapshot, McpServerView, McpTestTarget,
} from './types.ts'

export type * from './types.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    mcpServers: McpServers
  }
}

/** Deployment-level configuration. */
export interface Config {
  /** Servers the deployment composes; the settings base layer. */
  initialServers: McpServerEntry[]
  /** Whether this deployment accepts roster writes. */
  editable: boolean
  /** Total budget one connectivity test runs under, in milliseconds. */
  testTimeoutMs: number
  /** How many connectivity tests may run at once. */
  maxConcurrentTests: number
}

/** MCP server roster: settings, reconciliation, and connectivity testing. */
export class McpServers extends TypertRemoteService {
  static inject = ['settings']

  static Config: z<Config> = z.object({
    initialServers: z.array(McpServerEntrySchema).default([]),
    editable: z.boolean().default(true),
    testTimeoutMs: z.number().min(1_000).max(120_000).default(15_000),
    maxConcurrentTests: z.number().step(1).min(1).max(16).default(2),
  })

  private readonly supervisor: McpSupervisor
  private readonly probe: McpProbe
  private readonly scope: SettingsScope<{ servers: McpServerEntry[] }>

  /**
   * @param ctx - Host plugin context carrying the settings provider.
   * @param config - Deployment configuration; validated before any effect registers.
   */
  constructor(ctx: Context, public config: Config) {
    super(ctx, 'mcpServers')
    // A malformed deployment composition is self-contained, so it fails here
    // rather than surfacing as a server that silently never mounts.
    validateRoster(config.initialServers)

    this.scope = ctx.settings.register(MCP_SETTINGS_NAMESPACE, McpSettingsSchema, {
      base: { servers: config.initialServers },
    })
    this.supervisor = new McpSupervisor(ctx)
    this.probe = new McpProbe(McpClient, {
      testTimeoutMs: config.testTimeoutMs,
      maxConcurrentTests: config.maxConcurrentTests,
    })

    ctx.effect(() => this.scope.watch((next) => { this.supervisor.enqueue(next.servers) }), 'mcp-servers.reconcile')
    // Registered supervisor-first so teardown converges in-flight tests before
    // the bridges they were probing are unmounted.
    ctx.effect(() => () => this.supervisor.dispose(), 'mcp-servers.supervisor')
    ctx.effect(() => () => this.probe.dispose(), 'mcp-servers.probe')

    this.supervisor.enqueue(this.scope.get().servers)
  }

  /**
   * Every configured server with its current mounted state.
   * @returns The complete roster snapshot.
   */
  @Remote('list')
  list(): Promise<McpServerSnapshot> {
    // Deferred so a vanished settings provider rejects the call instead of
    // throwing synchronously out of the Remote dispatch.
    return Promise.resolve().then(() => this.snapshot())
  }

  /**
   * Add one server. The Host assigns its id; `serverName` is fixed from here on.
   * @param draft - The new server's fields.
   * @param expectedRevision - Revision the caller read.
   * @returns The roster after the write.
   */
  @Remote('add')
  async add(draft: McpServerDraft, expectedRevision: number): Promise<McpServerSnapshot> {
    const entry: McpServerEntry = { id: newServerId(), ...normalizeDraft(draft) }
    await this.write([...this.readServers(), entry], expectedRevision)
    return this.snapshot()
  }

  /**
   * Edit one server. The model-facing namespace is immutable and rejected here.
   * @param id - Roster entry to edit.
   * @param patch - Fields and variable-level secret operations to apply.
   * @param expectedRevision - Revision the caller read.
   * @returns The roster after the write.
   */
  @Remote('update')
  async update(id: string, patch: McpServerPatch, expectedRevision: number): Promise<McpServerSnapshot> {
    if (Object.hasOwn(patch, 'serverName')) {
      const attempted = (patch as { serverName?: unknown }).serverName
      throw new RemoteError(
        'mcp/immutable-server-name',
        'serverName is fixed when a server is added; remove and add the server to change it',
        { serverName: typeof attempted === 'string' ? attempted : '' },
      )
    }
    const servers = this.readServers()
    if (!servers.some(entry => entry.id === id)) {
      throw new RemoteError('mcp/unknown-server', `no MCP server has id "${id}"`, { id })
    }
    const next = servers.map(entry => entry.id === id ? applyPatch(entry, patch) : entry)
    await this.write(next, expectedRevision)
    return this.snapshot()
  }

  /**
   * Remove one server and release its namespace.
   * @param id - Roster entry to remove.
   * @param expectedRevision - Revision the caller read.
   * @returns The roster after the write.
   */
  @Remote('deleteServer')
  async deleteServer(id: string, expectedRevision: number): Promise<McpServerSnapshot> {
    const servers = this.readServers()
    const next = servers.filter(entry => entry.id !== id)
    if (next.length === servers.length) {
      throw new RemoteError('mcp/unknown-server', `no MCP server has id "${id}"`, { id })
    }
    await this.write(next, expectedRevision)
    this.probe.forget(id)
    return this.snapshot()
  }

  /**
   * Enable or disable one server without discarding its configuration.
   * @param id - Roster entry to toggle.
   * @param enabled - Whether the entry should mount.
   * @param expectedRevision - Revision the caller read.
   * @returns The roster after the write.
   */
  @Remote('setEnabled')
  setEnabled(id: string, enabled: boolean, expectedRevision: number): Promise<McpServerSnapshot> {
    return this.update(id, { enabled }, expectedRevision)
  }

  /**
   * Test one server's connectivity without mounting it.
   *
   * A draft may be tested before it is saved; when it derives from a saved
   * entry, that entry's stored secret values fill the draft's missing keys.
   *
   * @param target - The form contents and the saved entry they derive from.
   * @param signal - Caller cancellation, injected by the Gateway.
   * @returns The test outcome; a failed server is reported, not thrown.
   */
  @Remote('testConnection')
  async testConnection(target: McpTestTarget, signal: AbortSignal): Promise<McpConnectionTest> {
    return await this.probe.test(this.resolveTestEntry(target), target.basedOn, signal)
  }

  /** The roster as the settings document currently resolves it. */
  private readServers(): McpServerEntry[] {
    return this.scope.get().servers
  }

  /** The revision a write must present to be accepted. */
  private revision(): number {
    // Read through `ctx.get` rather than the injected property: a replaced or
    // withdrawn settings provider must fail here, not crash on property access.
    const descriptor = this.ctx
      .get('settings')
      ?.describe()
      .find(entry => entry.ns === MCP_SETTINGS_NAMESPACE)
    if (descriptor === undefined) {
      throw new Error('mcp-servers: the mcp settings namespace is not registered')
    }
    return descriptor.revision
  }

  /** Persist one complete roster, then let the watcher converge the bridges. */
  private async write(next: McpServerEntry[], expectedRevision: number): Promise<void> {
    if (!this.config.editable) {
      throw new RemoteError('mcp/not-editable', 'this deployment does not accept MCP configuration writes', {})
    }
    validateRoster(next)
    const actual = this.revision()
    if (actual !== expectedRevision) {
      throw new RemoteError(
        'mcp/stale-revision',
        'the MCP configuration changed since it was read',
        { expected: expectedRevision, actual },
      )
    }
    await this.ctx.settings.update(MCP_SETTINGS_NAMESPACE, { servers: next }, expectedRevision)
  }

  /** The page-facing projection of one entry; secret values are withheld. */
  private view(entry: McpServerEntry): McpServerView {
    const lastTest = this.probe.cached(entry.id)
    const mountError = this.supervisor.mountErrorOf(entry.id)
    const reconnect = explicitReconnect(entry.reconnect)
    return {
      id: entry.id,
      serverName: entry.serverName,
      enabled: entry.enabled,
      label: entry.label,
      transport: entry.transport,
      command: entry.command,
      args: [...entry.args],
      cwd: entry.cwd,
      envKeys: Object.keys(entry.env).sort(),
      url: entry.url,
      headerKeys: Object.keys(entry.headers).sort(),
      toolCallTimeoutMs: entry.toolCallTimeoutMs,
      failOnStartupError: entry.failOnStartupError,
      ...reconnect === undefined ? {} : { reconnect },
      mounted: this.supervisor.isMounted(entry.id),
      ...lastTest === undefined ? {} : { lastTest },
      ...mountError === undefined ? {} : { mountError },
    }
  }

  /** One complete snapshot for the page. */
  private snapshot(): McpServerSnapshot {
    const capabilities: McpCapabilities = {
      canEdit: this.config.editable,
      testTimeoutMs: this.config.testTimeoutMs,
    }
    return {
      servers: this.readServers().map(entry => this.view(entry)),
      revision: this.revision(),
      capabilities,
    }
  }

  /** Resolve a test target's fields, backfilling stored secrets for edits. */
  private resolveTestEntry(target: McpTestTarget): McpServerFields {
    const draft = normalizeDraft(target.draft)
    if (target.basedOn === undefined) return draft
    const stored = this.readServers().find(entry => entry.id === target.basedOn)
    if (stored === undefined) {
      throw new RemoteError('mcp/unknown-server', `no MCP server has id "${target.basedOn}"`, { id: target.basedOn })
    }
    return {
      ...draft,
      // Keys the draft does not carry keep the stored value, matching the
      // variable-level rule the edit path uses.
      env: { ...stored.env, ...draft.env },
      headers: { ...stored.headers, ...draft.headers },
    }
  }
}

/** One fresh roster id, opaque to the page but stable for reconciliation. */
function newServerId(): string {
  return `srv-${randomUUID().replaceAll('-', '').slice(0, 16)}`
}

export default McpServers
