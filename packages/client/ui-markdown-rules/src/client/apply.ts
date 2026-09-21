/**
 * Built-in markdown fence rules, browser half.
 *
 * One contribution per fence seat: the surfaces declare the fence seats and the
 * document renderer dispatches into them, so these rules are ordinary chain
 * entries that own a fence language and nothing else. Registration waits on the
 * surface's declaration (`ctx.slots.inject`), so this plugin and every surface
 * that hosts it load in either order and each surface disappears independently.
 *
 * Copy rides the shared `common` namespace: the fence chrome a rule hands its
 * block (copy, copied, the diagram's accessible name) is cross-feature
 * vocabulary, not markdown-specific wording.
 */

import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-markdown/client'
// Type-only: pulls the slot registry's Context merge (ctx.slots).
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import { MathFence, selectMath } from './rules/MathFence.tsx'
import { MermaidFence, selectMermaid } from './rules/MermaidFence.tsx'

/** Required services: the slot registry and the shared copy vocabulary. */
export const inject = ['slots', 'locale']

/**
 * Mount the built-in fence rules into every surface that declares a fence seat.
 * @param ctx - Client root context.
 */
export function apply(ctx: ClientContext): void {
  // Built-in rule: Mermaid diagrams. One entry per fence seat; each entry is
  // independent, so a surface losing its declaration takes only its own entry.
  ctx.slots.inject('conversation.chat.markdown.fence', () => ctx.slots.register(
    { name: 'conversation.chat.markdown.fence', select: selectMermaid, locale: 'common' }, MermaidFence))
  ctx.slots.inject('conversation.composer.markdown.fence', () => ctx.slots.register(
    { name: 'conversation.composer.markdown.fence', select: selectMermaid, locale: 'common' }, MermaidFence))
  ctx.slots.inject('conversation.trajectory.markdown.fence', () => ctx.slots.register(
    { name: 'conversation.trajectory.markdown.fence', select: selectMermaid, locale: 'common' }, MermaidFence))
  ctx.slots.inject('sidebar.right.tab.document.markdown.fence', () => ctx.slots.register(
    { name: 'sidebar.right.tab.document.markdown.fence', select: selectMermaid, locale: 'common' }, MermaidFence))

  // Built-in rule: TeX math, in all three shapes the renderer dispatches.
  ctx.slots.inject('conversation.chat.markdown.fence', () => ctx.slots.register(
    { name: 'conversation.chat.markdown.fence', select: selectMath, locale: 'common' }, MathFence))
  ctx.slots.inject('conversation.composer.markdown.fence', () => ctx.slots.register(
    { name: 'conversation.composer.markdown.fence', select: selectMath, locale: 'common' }, MathFence))
  ctx.slots.inject('conversation.trajectory.markdown.fence', () => ctx.slots.register(
    { name: 'conversation.trajectory.markdown.fence', select: selectMath, locale: 'common' }, MathFence))
  ctx.slots.inject('sidebar.right.tab.document.markdown.fence', () => ctx.slots.register(
    { name: 'sidebar.right.tab.document.markdown.fence', select: selectMath, locale: 'common' }, MathFence))
}
