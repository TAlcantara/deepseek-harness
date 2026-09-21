/**
 * Markdown renderer plugin, browser half.
 *
 * Two kinds of contribution, both declared by the rendering surface rather
 * than here: the seat that fills a surface's markdown hole, and the built-in
 * fence rules that fill its fence hole. Registration waits on the surface's
 * declaration (`ctx.slots.inject`), so this plugin and the surfaces that host
 * it load in either order and each surface disappears independently.
 *
 * Copy rides the shared `common` namespace: the chrome this renderer owns
 * (fence copy, footnote heading, diagram name) is cross-feature vocabulary,
 * not markdown-specific wording.
 */

import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import { MarkdownSeat } from './markdown/MarkdownSeat.tsx'
import { MathFence, selectMath } from './markdown/MathFence.tsx'
import { MermaidFence, selectMermaid } from './markdown/MermaidFence.tsx'

/** Required services: the slot registry and the shared copy vocabulary. */
export const inject = ['slots', 'locale']

/**
 * Mount the seat and the built-in fence rules into every surface that
 * declares a markdown pair.
 * @param ctx - Client root context.
 */
export function apply(ctx: ClientContext): void {
  // The seat: one component, one registration per surface, because a slot name
  // has exactly one declarer and each surface declares its own hole.
  ctx.slots.inject('conversation.chat.markdown', () => ctx.slots.register(
    { name: 'conversation.chat.markdown', locale: 'common' }, MarkdownSeat))
  ctx.slots.inject('conversation.composer.markdown', () => ctx.slots.register(
    { name: 'conversation.composer.markdown', locale: 'common' }, MarkdownSeat))
  ctx.slots.inject('conversation.trajectory.markdown', () => ctx.slots.register(
    { name: 'conversation.trajectory.markdown', locale: 'common' }, MarkdownSeat))
  ctx.slots.inject('sidebar.right.tab.document.markdown', () => ctx.slots.register(
    { name: 'sidebar.right.tab.document.markdown', locale: 'common' }, MarkdownSeat))

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
