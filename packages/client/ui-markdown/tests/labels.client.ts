import type { MermaidBlockLabels } from '@deepseek-ai/dsh-client-ui-primitives'
import type { MarkdownLabels } from '../src/client/contract/slots.ts'

/** Document chrome for the specs that render markdown directly. */
export const markdownLabels: MarkdownLabels = {
  code: { copyLabel: '复制', copiedLabel: '复制成功' },
  footnotes: 'Footnotes',
}

/** Diagram chrome for the specs that render a diagram block directly. */
export const diagramLabels: MermaidBlockLabels = {
  copyLabel: '复制', copiedLabel: '复制成功', diagram: '图表',
}
