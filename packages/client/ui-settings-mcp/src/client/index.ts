/**
 * MCP settings page plugin, browser half. Registers one `settings.section`
 * entry whose roster, editor, and connectivity test run entirely over the
 * generated `mcpServers` Remote namespace.
 * Export discipline: packages/client/AGENTS.md.
 *
 * @module @deepseek-ai/dsh-client-ui-settings-mcp
 */

import type { Context as ClientContext } from '@deepseek-ai/cordis'
// Type-only: pulls the shell's SlotMap merge (the 'settings.section' entry).
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
// Type-only: pulls the locale plugin's Context merge (ctx.locale).
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
// Type-only: pulls the ctx.remote merge and the mcpServers namespace.
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type { McpSectionInjected } from './contract.ts'
import { en, zh, type McpLocaleKey } from './locales.ts'
import { McpSection } from './McpSection.tsx'
import { createMcpServersOperations } from './operations.ts'
import { createMcpServersStore } from './store.ts'

export type { McpSectionInjected } from './contract.ts'
export type { McpSectionProps } from './McpSection.tsx'
export type { McpLocaleKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** The MCP settings page copy. */
    'settings.mcp': McpLocaleKey
  }
}

/** Dictionary namespace owned by this plugin. */
export const NS = 'settings.mcp'

/** Services required by the settings registration and the generated Remote face. */
export const inject = ['slots', 'locale', 'remote', 'remote.mcpServers']

/**
 * Register the MCP section and keep it fresh across connection resets.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-settings-mcp: copy dictionaries')

  const t = ctx.locale.bind(NS)
  const store = createMcpServersStore()
  const operations = createMcpServersOperations(ctx.remote.mcpServers, store, t)
  const injected = (): McpSectionInjected => ({ operations, hooks: { snapshot: store }, t })

  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section',
    id: 'mcp',
    order: 12,
    label: () => t('nav'),
    locale: NS,
    inject: injected,
  }, McpSection))

  // A reconnect may have replaced the Host behind the wire; re-read rather
  // than leaving a roster that predates it on screen.
  ctx.on('connection/reset', () => { void operations.reload() })
}
