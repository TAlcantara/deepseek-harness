/**
 * Built-in fence rule: TeX math. It claims the three shapes the renderer
 * dispatches — a settled ```math fence, a display math node, and an inline
 * math node — and typesets each through KaTeX, replicating the arms the
 * renderer used to hold directly (including a ```math fence's trailing
 * newline, which the replaced pipeline's text extraction saw).
 *
 * The rule lives here; the typesetter it calls is a statically linked
 * primitive, because KaTeX's markup and its stylesheet belong to the static
 * baseline every surface already loads.
 */

import type { ReactNode } from 'react'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import { renderTexToReact } from '@deepseek-ai/dsh-client-ui-primitives'
import type { MarkdownFenceRequest } from '../contract/slots.ts'

/** What the math rule's selector hands its component. */
export interface MathMatch {
  /** TeX source exactly as KaTeX must receive it. */
  source: string
  /** Display (block) versus inline rendering. */
  display: boolean
}

/** One math rule entry, typed against the canonical fence seat. */
type MathFenceProps =
  PropsRuntime<'conversation.chat.markdown.fence'>
  & { matched: MathMatch }
  & PropsLocale<'common'>

/**
 * Selector for the math rule.
 * @param request - The fence or math node awaiting a rule.
 * @returns The KaTeX input for a math node, or null for anything else.
 */
export function selectMath(request: MarkdownFenceRequest): MathMatch | null {
  if (request.kind === 'inline') return { source: request.source, display: false }
  if (request.kind === 'display') return { source: request.source, display: true }
  // An incomplete fence cannot be typeset: a ```math fence is claimed only once
  // the reply settles, matching the arm this rule replaced.
  if (request.streaming || request.lang !== 'math') return null
  // A ```math fence typesets as display TeX; the fence body needs the trailing
  // newline the replaced pipeline's text extraction saw.
  return { source: `${request.source}\n`, display: true }
}

/**
 * Render one math node.
 * @param props - The selector's TeX input.
 * @returns The KaTeX element tree, or its documented error span.
 */
export function MathFence({ matched }: MathFenceProps): ReactNode {
  return <>{renderTexToReact(matched.source, matched.display)}</>
}
