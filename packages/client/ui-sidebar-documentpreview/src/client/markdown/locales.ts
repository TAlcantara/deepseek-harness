/** Markdown document preview implementation labels. */
export const zh = {
  'viewer.label': 'Markdown',
} satisfies Record<string, string>

/** Markdown namespace keys. */
export type MarkdownPreviewKey = keyof typeof zh

/** English labels, paired with the Chinese key set. */
export const en = {
  'viewer.label': 'Markdown',
} satisfies Record<MarkdownPreviewKey, string>

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Markdown document preview implementation name. */
    documentMarkdown: MarkdownPreviewKey
  }
}
