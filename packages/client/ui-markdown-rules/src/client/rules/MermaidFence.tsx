/**
 * Built-in fence rule: Mermaid diagrams. It claims a fence whose language
 * token is `mermaid` and renders the diagram block, which keeps the code arm
 * for the whole stream and replaces it once the diagram is built.
 *
 * The rule lives here; the block it draws is a statically linked primitive
 * because Mermaid is loaded by dynamic `import()`, and a dynamic client bundle
 * cannot defer a third-party library without emitting chunks of its own.
 */

import { useMemo } from 'react'
import type { ReactNode } from 'react'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import { MermaidBlock, type MermaidBlockLabels } from '@deepseek-ai/dsh-client-ui-primitives'
import type { MarkdownFenceRequest } from '@deepseek-ai/dsh-client-ui-markdown/client'

/** One diagram rule entry, typed against the canonical fence seat. */
type MermaidFenceProps =
  PropsRuntime<'conversation.chat.markdown.fence'>
  & { matched: string }
  & PropsLocale<'common'>

/**
 * Selector for the diagram rule.
 * @param request - The fence or math node awaiting a rule.
 * @returns The fence body of a `mermaid` fence, or null for anything else.
 */
export function selectMermaid(request: MarkdownFenceRequest): string | null {
  if (request.kind !== 'fence' || request.streaming) return null
  return request.lang === 'mermaid' ? request.source : null
}

/**
 * Render one diagram fence.
 * @param props - The claimed fence body and the bound translator.
 * @returns The diagram, or the code-block arm while it is pending or failed.
 */
export function MermaidFence({ matched, t }: MermaidFenceProps): ReactNode {
  const labels = useMemo<MermaidBlockLabels>(() => ({
    copyLabel: t('copy'),
    copiedLabel: t('copied'),
    diagram: t('markdown.diagram'),
  }), [t])
  return <MermaidBlock source={matched} labels={labels} />
}
