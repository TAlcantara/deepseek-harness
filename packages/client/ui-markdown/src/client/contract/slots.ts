/**
 * Slot contract for the markdown renderer.
 *
 * A markdown seat is a hole a rendering surface declares where authored
 * markdown belongs; `MarkdownSeat` fills it. A fence seat is the sibling hole
 * that surface declares for fence dispatch, so a rendering rule can claim a
 * fence (or a math node) without the document renderer knowing the rule.
 *
 * The seat and its fence belong to the surface that renders them: one slot
 * name has one declarer, so each surface declares its own pair and threads the
 * fence renderer into the seat through {@link MarkdownSeatOwnerProps}.
 */

import type { ReactNode } from 'react'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-locale/client'

/** Copy-button labels forwarded to fence code blocks. */
export interface MarkdownCodeLabels {
  /** Copy-button idle label. */
  copyLabel: string
  /** Copy-button label during the post-copy confirmation window. */
  copiedLabel: string
}

/** Localized chrome for a Markdown document. */
export interface MarkdownLabels {
  code: MarkdownCodeLabels
  footnotes: string
}

/**
 * Local-path image vocabulary for image destinations: the owner maps an
 * authored destination that fails the remote-URL allowlist (an absolute local
 * file path, for example) to a displayable URL it can vouch for. Absent
 * wherever no such vocabulary exists, authored local destinations keep their
 * documented fallback (the image's alt text). Rewritten destinations must be
 * absolute; the renderer re-checks their protocol before emitting them.
 */
export interface MarkdownPathImages {
  /**
   * Resolve one authored image destination.
   * @param value - The destination exactly as the markdown author wrote it.
   * @returns A displayable absolute URL, or undefined when the destination
   * names no displayable image — it then stays inert alt text.
   */
  resolve(value: string): string | undefined
}

/**
 * File-mention affordance for inline code: the owner resolves an authored
 * token to the file it names, using its own vocabulary of real files — the
 * renderer never guesses at what looks like a path.
 */
export interface MarkdownFileMentions {
  /**
   * Resolve one inline-code token.
   * @param value - The authored token, exactly as written.
   * @returns The opener with its accessible label and full-path title, or
   * undefined when the token names no known file — it then stays inert code.
   */
  resolve(value: string): { open: () => void; label: string; title: string } | undefined
}

/**
 * One dispatch request from the document renderer to the surface's fence seat.
 * A rule narrows on `kind`: a fenced code block carries its info string, while
 * `display` and `inline` carry a math node's source. Commands, link
 * destinations, and image destinations never reach this seat.
 */
export type MarkdownFenceRequest =
  | {
    kind: 'fence'
    /** The fence's normalized language token, or undefined when the info string names none. */
    lang: string | undefined
    /** The fence's info string, exactly as authored, for rules that read arguments. */
    info: string
    /** The fence body without the surrounding fence lines. */
    source: string
    /** Whether the document is still being written; a rule that cannot render an incomplete fence declines. */
    streaming: boolean
  }
  | { kind: 'display'; source: string }
  | { kind: 'inline'; source: string }

/**
 * One fence-dispatch call: the surface's fence seat returns the claiming
 * rule's element, or the renderer's own `fallback` when every rule declines.
 * A chain seat always yields an element, so the fallback travels as the
 * chain's fallback body rather than as a null result.
 */
export type MarkdownFenceRenderer = (request: MarkdownFenceRequest, fallback: ReactNode) => ReactNode

/** Owner currency of one markdown seat. */
export interface MarkdownSeatOwnerProps {
  /** Already-settled or still-streaming markdown source. */
  text: string
  /** Whether the source is the tail of a message still being written. */
  streaming: boolean
  /** Resolved file mentions for this document; absent where no opener vocabulary exists. */
  mentions?: MarkdownFileMentions | undefined
  /** Local-path image vocabulary for this document; absent where no rewriting owner exists. */
  pathImages?: MarkdownPathImages | undefined
  /**
   * Render one fence or math node through the surface's fence seat. The
   * renderer supplies the element it would draw itself — the code arm for a
   * fence, the authored source for math — and the surface renders that as the
   * seat's fallback, so a declined request keeps the renderer's own behavior.
   * The surface owns this function's identity: it must be stable across
   * renders, because a new identity discards the streaming render cache.
   * @param request - The fence or math node awaiting a rule.
   * @param fallback - What the renderer draws when no rule claims the request.
   * @returns The elected rule's element, or the fallback.
   */
  renderFence: MarkdownFenceRenderer
}

/**
 * Props of the shared seat component. Every markdown seat declares the same
 * owner share and session scope, so one component serves them all; the
 * canonical key below only supplies that shared runtime share.
 */
export type MarkdownSeatProps =
  PropsRuntime<'conversation.chat.markdown'>
  & PropsLocale<'common'>

/**
 * Render one markdown document through an occupied seat. The surface's
 * declaring entry owns this closure: it is the authorization to render that
 * location, and it must stay reference-stable because the document renderer's
 * streaming cache is keyed on it.
 */
export type MarkdownSeatRenderer = (owner: Omit<MarkdownSeatOwnerProps, 'renderFence'>) => ReactNode

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface SlotMap {
    /** Authored markdown anywhere in the Chat transcript. */
    'conversation.chat.markdown': { kind: 'single'; scope: 'session'; owner: MarkdownSeatOwnerProps }
    /** Fence and math dispatch for Chat's markdown. */
    'conversation.chat.markdown.fence': { kind: 'chain'; scope: 'session'; owner: MarkdownFenceRequest }
    /** Question detail and the plan-review body. */
    'conversation.composer.markdown': { kind: 'single'; scope: 'session'; owner: MarkdownSeatOwnerProps }
    /** Fence and math dispatch for the question composer. */
    'conversation.composer.markdown.fence': { kind: 'chain'; scope: 'session'; owner: MarkdownFenceRequest }
    /** Inspected markdown records in the trajectory view. */
    'conversation.trajectory.markdown': { kind: 'single'; scope: 'session'; owner: MarkdownSeatOwnerProps }
    /** Fence and math dispatch for the trajectory view. */
    'conversation.trajectory.markdown.fence': { kind: 'chain'; scope: 'session'; owner: MarkdownFenceRequest }
    /** A retained markdown document in the right sidebar. */
    'sidebar.right.tab.document.markdown': { kind: 'single'; scope: 'session'; owner: MarkdownSeatOwnerProps }
    /** Fence and math dispatch for the document preview. */
    'sidebar.right.tab.document.markdown.fence': { kind: 'chain'; scope: 'session'; owner: MarkdownFenceRequest }
  }
}
