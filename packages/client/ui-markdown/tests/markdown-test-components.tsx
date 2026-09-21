import type { ComponentProps, ReactNode } from 'react'
import {
  JsonBlock as LocalizedJsonBlock,
  MermaidBlock,
  renderTexToReact,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { MarkdownCodeLabels, MarkdownFenceRenderer, MarkdownFenceRequest, MarkdownLabels } from '../src/client/contract/slots.ts'
import { MarkdownText as LocalizedMarkdownText } from '../src/client/markdown/MarkdownText.tsx'
// The built-in rules live in their own plugin; this fixture composes them so the
// renderer's specs exercise the dispatch a real surface performs.
import { selectMath } from '../../ui-markdown-rules/src/client/rules/MathFence.tsx'
import { selectMermaid } from '../../ui-markdown-rules/src/client/rules/MermaidFence.tsx'
import { diagramLabels, markdownLabels as defaultMarkdownLabels } from './labels.client.ts'

/**
 * Dispatch a fence the way the built-in rules do, without the slot machinery
 * or a real translator: the specs assert the renderer's output, so they need
 * the rules' selectors and blocks rather than the registered components.
 * @param request - The fence or math node awaiting a rule.
 * @param fallback - What the renderer draws when no rule claims the request.
 * @returns The claimed node's element, or the fallback.
 */
export function testRenderFence(request: MarkdownFenceRequest, fallback: ReactNode): ReactNode {
  const math = selectMath(request)
  if (math !== null) return renderTexToReact(math.source, math.display)
  const source = selectMermaid(request)
  return source === null ? fallback : <MermaidBlock source={source} labels={diagramLabels} />
}

type MarkdownTextProps = Omit<ComponentProps<typeof LocalizedMarkdownText>, 'labels' | 'renderFence'> & {
  labels?: MarkdownLabels
  codeLabels?: MarkdownCodeLabels
  renderFence?: MarkdownFenceRenderer
}

export function MarkdownText({
  labels,
  codeLabels,
  renderFence,
  ...props
}: MarkdownTextProps) {
  const resolved = labels ?? (codeLabels === undefined
    ? defaultMarkdownLabels
    : { ...defaultMarkdownLabels, code: codeLabels })
  return <LocalizedMarkdownText {...props} labels={resolved} renderFence={renderFence ?? testRenderFence} />
}

type JsonBlockProps = Omit<ComponentProps<typeof LocalizedJsonBlock>, 'truncatedLabel'> & {
  truncatedLabel?: (total: number) => string
}

export function JsonBlock({ truncatedLabel, ...props }: JsonBlockProps) {
  return (
    <LocalizedJsonBlock
      {...props}
      truncatedLabel={truncatedLabel ?? (total => `… 已截断，共 ${total} 字符`)}
    />
  )
}
