import { createElement } from 'react'
import type { MarkdownSeatRenderer } from '@deepseek-ai/dsh-client-ui-markdown/client'
import { MarkdownText } from '../../ui-markdown/tests/markdown-test-components.tsx'

/**
 * Render the trajectory markdown seat for these specs: the real document
 * renderer and its built-in rules, without the slot machinery a seat normally
 * arrives through. These specs assert the trajectory surface, so the seat is
 * not what they test.
 */
export const renderMarkdown: MarkdownSeatRenderer = owner => createElement(MarkdownText, {
  text: owner.text,
  streaming: owner.streaming,
  fileMentions: owner.mentions,
  pathImages: owner.pathImages,
})
