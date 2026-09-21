/**
 * Markdown renderer plugin, browser half.
 *
 * The surface declares the hole; this plugin fills it. Registration waits on
 * that declaration (`ctx.slots.inject`), so this plugin and the surfaces that
 * host it load in either order and each surface disappears independently. The
 * fence rules that decide what a fence becomes are contributions of their own
 * plugin (`dsh-client-ui-markdown-rules`), which registers into the same pair.
 *
 * Copy rides the shared `common` namespace: the chrome this renderer owns
 * (fence copy, footnote heading) is cross-feature vocabulary, not
 * markdown-specific wording.
 */

import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import { MarkdownSeat } from './markdown/MarkdownSeat.tsx'

/** Required services: the slot registry and the shared copy vocabulary. */
export const inject = ['slots', 'locale']

/**
 * Mount the seat into every surface that declares a markdown seat.
 * @param ctx - Client root context.
 */
export function apply(ctx: ClientContext): void {
  // One component, one registration per surface, because a slot name has
  // exactly one declarer and each surface declares its own hole.
  ctx.slots.inject('conversation.chat.markdown', () => ctx.slots.register(
    { name: 'conversation.chat.markdown', locale: 'common' }, MarkdownSeat))
  ctx.slots.inject('conversation.composer.markdown', () => ctx.slots.register(
    { name: 'conversation.composer.markdown', locale: 'common' }, MarkdownSeat))
  ctx.slots.inject('conversation.trajectory.markdown', () => ctx.slots.register(
    { name: 'conversation.trajectory.markdown', locale: 'common' }, MarkdownSeat))
  ctx.slots.inject('sidebar.right.tab.document.markdown', () => ctx.slots.register(
    { name: 'sidebar.right.tab.document.markdown', locale: 'common' }, MarkdownSeat))
}
