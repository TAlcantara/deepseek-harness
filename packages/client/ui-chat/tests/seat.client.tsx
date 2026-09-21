import { createElement } from 'react'
import type { MarkdownSeatRenderer } from '@deepseek-ai/dsh-client-ui-markdown/client'
import { MarkdownText } from '../../ui-markdown/tests/markdown-test-components.tsx'

/**
 * Render a Chat markdown seat for these specs: the real document renderer and
 * its built-in rules, without the slot machinery a seat normally arrives
 * through. Chat specs assert Chat behavior, so the seat is not what they test.
 */
export const renderMarkdown: MarkdownSeatRenderer = owner => createElement(MarkdownText, {
  text: owner.text,
  streaming: owner.streaming,
  fileMentions: owner.mentions,
  pathImages: owner.pathImages,
})
