/** Markdown document body: the surface that hosts the renderer's seat over the owner's accumulated text. */
import { useCallback } from 'react'
import type { ReactNode } from 'react'
import type { MarkdownFenceRequest, MarkdownSeatRenderer } from '@deepseek-ai/dsh-client-ui-markdown/client'
import type { PropsRenderSlots } from '@deepseek-ai/dsh-client-ui-slots'
import type { DocumentPreviewProps } from '../document/contract.ts'
import css from './MarkdownBody.module.css'

/** Standard document inputs plus the markdown seat pair this body declares. */
export type MarkdownBodyProps = DocumentPreviewProps
  & PropsRenderSlots<'sidebar.right.tab.document.markdown' | 'sidebar.right.tab.document.markdown.fence'>

/**
 * Render one accumulated document; EOF completes the renderer's full parse.
 * @param props - owner-loaded contents and the markdown seat pair this body hosts.
 * @returns Markdown content, or nothing for a non-text delivery.
 */
export function MarkdownBody({ content, renderSlot, renderSlotChain }: MarkdownBodyProps): ReactNode {
  // Stable closures: the seat bakes both into the renderer's streaming cache,
  // and a new identity between page arrivals would discard it.
  const renderFence = useCallback(
    (request: MarkdownFenceRequest, fallback: ReactNode): ReactNode =>
      renderSlotChain('sidebar.right.tab.document.markdown.fence', request, { fallback }),
    [renderSlotChain],
  )
  const renderMarkdown = useCallback<MarkdownSeatRenderer>(
    owner => renderSlot('sidebar.right.tab.document.markdown', { ...owner, renderFence }),
    [renderSlot, renderFence],
  )
  if (content.kind !== 'text') return null
  return (
    <div className={css.document} data-document-markdown>
      {renderMarkdown({ text: content.text, streaming: !content.eof })}
    </div>
  )
}
