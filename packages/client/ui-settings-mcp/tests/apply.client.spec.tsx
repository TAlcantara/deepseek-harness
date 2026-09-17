// @vitest-environment jsdom
/**
 * The MCP settings page registration: the section entry it contributes, the
 * dictionary it owns, and how it follows the shell's declaration.
 */

import { Context, Service } from '@deepseek-ai/cordis'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import { SlotRegistry } from '@deepseek-ai/dsh-client-ui-renderer/client'
import { resolveSlotLabel } from '@deepseek-ai/dsh-client-ui-slots'
import { usePinnedBrowserLanguages } from '@deepseek-ai/dsh-client-test-runtime'
import { apply, inject, NS } from '../src/client/index.ts'
import { McpSection } from '../src/client/McpSection.tsx'
import type { McpSectionInjected } from '../src/client/contract.ts'
import { apply as hostApply } from '../src/index.ts'

usePinnedBrowserLanguages('zh-CN')

const contexts: Context[] = []

afterEach(async () => {
  await Promise.all(contexts.splice(0).map(ctx => ctx.fiber.dispose()))
})

/** One empty roster answer. */
const EMPTY = { servers: [], revision: 0, capabilities: { canEdit: true, testTimeoutMs: 15_000 } }

/** A Client root carrying the slots, locale, and Remote services the plugin injects. */
async function bench() {
  const ctx = new Context()
  contexts.push(ctx)
  await ctx.plugin(SlotRegistry).await()
  const locale = new LocaleRuntime(ctx)
  ctx.provide('locale', locale)
  class RemoteService extends Service {
    constructor(serviceCtx: Context) {
      super(serviceCtx, 'remote')
    }
  }
  new RemoteService(ctx)
  const list = vi.fn(async () => ({ ok: true, value: EMPTY }))
  ctx.provide('remote.mcpServers', { list })
  return { ctx, slots: ctx.get('slots') as SlotRegistry, locale, list }
}

/** Declare the shell seat the section registers into. */
function declare(slots: SlotRegistry): () => void {
  return slots.register({
    name: 'root',
    children: { 'settings.section': { kind: 'list', scope: 'root' } },
  } as never, () => null)
}

describe('ui-settings-mcp browser plugin', () => {
  it('keeps the host Loader entry inert', () => {
    expect(hostApply).not.toThrow()
  })

  it('declares only the services the section reads', () => {
    expect(inject).toEqual(['slots', 'locale', 'remote', 'remote.mcpServers'])
  })

  it('registers one localized settings section without reading the Remote', async () => {
    const b = await bench()
    declare(b.slots)
    await b.ctx.plugin({ inject: [...inject], apply }).await()

    const entry = b.slots.entries('settings.section')[0]!
    expect(entry.component).toBe(McpSection)
    expect(entry.options).toMatchObject({ id: 'mcp', order: 12 })
    expect(entry.locale).toBe(NS)
    expect(resolveSlotLabel(entry.options.label)).toBe('MCP')
    expect(b.list).not.toHaveBeenCalled()

    const injected = (entry.inject as unknown as () => McpSectionInjected)()
    expect(injected.t('title')).toBe('MCP 服务器')
    expect(injected.hooks.snapshot.getSnapshot().status).toBe('idle')
  })

  it('waits for the shell declaration and leaves with the plugin fiber', async () => {
    const b = await bench()
    const fiber = b.ctx.plugin({ inject: [...inject], apply })
    await fiber.await()
    expect(b.slots.entries('settings.section')).toHaveLength(0)

    const stop = declare(b.slots)
    await vi.waitFor(() => { expect(b.slots.entries('settings.section')).toHaveLength(1) })

    stop()
    expect(b.slots.entries('settings.section')).toHaveLength(0)
  })

  it('re-reads the roster on a connection reset', async () => {
    const b = await bench()
    declare(b.slots)
    await b.ctx.plugin({ inject: [...inject], apply }).await()
    const entry = b.slots.entries('settings.section')[0]!
    const injected = (entry.inject as unknown as () => McpSectionInjected)()

    b.ctx.emit('connection/reset')
    await vi.waitFor(() => { expect(b.list).toHaveBeenCalledTimes(1) })
    expect(injected.hooks.snapshot.getSnapshot().status).toBe('ready')
  })

  it('switches the section label with the active locale', async () => {
    const b = await bench()
    declare(b.slots)
    await b.ctx.plugin({ inject: [...inject], apply }).await()

    b.locale.setLocale('en')
    expect(resolveSlotLabel(b.slots.entries('settings.section')[0]!.options.label)).toBe('MCP')
  })
})
