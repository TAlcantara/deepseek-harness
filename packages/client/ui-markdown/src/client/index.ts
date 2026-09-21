/** Browser markdown renderer plugin. */
export { apply, inject } from './apply.ts'
export type {
  MarkdownFenceRenderer, MarkdownFenceRequest, MarkdownFileMentions, MarkdownLabels,
  MarkdownPathImages, MarkdownSeatOwnerProps, MarkdownSeatRenderer,
} from './contract/slots.ts'
