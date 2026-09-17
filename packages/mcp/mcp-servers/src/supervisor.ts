/**
 * Reconciler from the settings roster to live `dsh-mcp-client` instances.
 * One roster entry owns at most one mounted bridge, so a write that changes a
 * server's configuration unmounts the old instance before mounting the next.
 *
 * @module
 */

import { isDeepStrictEqual } from 'node:util'
import type { Context, Fiber } from '@deepseek-ai/cordis'
import * as McpClient from '@deepseek-ai/dsh-mcp-client'
import { toClientConfig } from './settings.ts'
import type { McpServerEntry } from './types.ts'

/** One mounted bridge instance and the entry it was built from. */
interface LiveServer {
  entry: McpServerEntry
  fiber: Fiber
}

/**
 * Serialized roster reconciler.
 *
 * Every reconciliation runs on one promise chain, so two writes can never
 * interleave their unmount/mount steps. A mount failure is recorded against
 * its entry instead of rejecting the chain: one unusable server must not stop
 * the others from converging.
 */
export class McpSupervisor {
  private readonly live = new Map<string, LiveServer>()
  private readonly failures = new Map<string, string>()
  private chain: Promise<void> = Promise.resolve()
  private disposed = false

  /**
   * @param ctx - Host plugin context that parents every mounted bridge.
   */
  constructor(private readonly ctx: Context) {}

  /**
   * Whether one roster entry currently has a mounted bridge.
   * @param id - Roster entry id.
   * @returns True once the instance is mounted, whether or not it connected.
   */
  isMounted(id: string): boolean {
    return this.live.has(id)
  }

  /**
   * Why the last mount attempt for one entry failed.
   * @param id - Roster entry id.
   * @returns The failure summary, or undefined when the mount succeeded.
   */
  mountErrorOf(id: string): string | undefined {
    return this.failures.get(id)
  }

  /**
   * Queue one reconciliation against a roster snapshot.
   * @param servers - The full roster, as the settings document resolved it.
   */
  enqueue(servers: readonly McpServerEntry[]): void {
    if (this.disposed) return
    // Snapshot on entry: the caller may hand over the settings document's own
    // arrays and mutate them before this reconciliation runs.
    const next = servers.map(entry => structuredClone(entry))
    const run = this.chain.then(() => this.reconcile(next))
    // The chain tail must survive a rejected reconciliation, so one bad pass
    // never poisons later ones. `reconcile` contains every mount failure, so
    // this branch is defensive rather than a path the tests can reach.
    /* v8 ignore next -- defensive: reconcile contains mount failures and does not reject */
    this.chain = run.catch(() => { /* keep the queue alive */ })
  }

  /**
   * Stop accepting reconciliations, drain the queue, then unmount every bridge.
   */
  async dispose(): Promise<void> {
    this.disposed = true
    await this.chain
    const mounted = [...this.live.values()]
    this.live.clear()
    this.failures.clear()
    for (const server of mounted) await server.fiber.dispose()
  }

  /** Converge the mounted set onto one roster snapshot. */
  private async reconcile(next: readonly McpServerEntry[]): Promise<void> {
    if (this.disposed) return
    const desired = new Map(next.filter(entry => entry.enabled).map(entry => [entry.id, entry]))

    for (const [id, server] of [...this.live]) {
      if (desired.has(id)) continue
      this.live.delete(id)
      this.failures.delete(id)
      await server.fiber.dispose()
    }

    for (const [id, entry] of desired) {
      const mounted = this.live.get(id)
      if (mounted !== undefined
        && isDeepStrictEqual(toClientConfig(mounted.entry), toClientConfig(entry))) continue
      if (mounted !== undefined) {
        this.live.delete(id)
        await mounted.fiber.dispose()
      }
      try {
        const fiber = await this.ctx.plugin(McpClient, toClientConfig(entry))
        this.live.set(id, { entry, fiber })
        this.failures.delete(id)
      } catch (error: unknown) {
        // A load failure here is an assembly conflict — typically a foreign
        // registration already holding this serverName. The entry stays in the
        // roster so the operator sees it and the next edit retries.
        this.failures.set(id, String(error))
        this.ctx.logger.error(`mcp-servers: failed to mount ${entry.serverName}: ${String(error)}`)
      }
    }
  }
}
