/**
 * The shared markdown seat: the one component every rendering surface fills
 * its markdown hole with. It owns the document chrome copy (the surface
 * declares the hole and passes its fence renderer, not its labels) and hands
 * the document renderer the fence dispatch it was given.
 */

import { memo, useMemo } from 'react'
import type { ReactNode } from 'react'
import type { MarkdownLabels, MarkdownSeatProps } from '../contract/slots.ts'
import { MarkdownText } from './MarkdownText.tsx'

/**
 * Render one authored markdown document for the surface that declared the seat.
 * @param props - Document source and vocabulary, the surface's fence renderer,
 * and the bound `common` translator this seat draws its chrome copy from.
 * @returns The rendered document.
 */
export const MarkdownSeat = memo(function MarkdownSeat({
  text, streaming, mentions, pathImages, renderFence, t,
}: MarkdownSeatProps): ReactNode {
  // Stable per locale revision: a new identity discards the renderer's
  // streaming cache mid-message (same contract as the renderer's own props).
  const labels = useMemo<MarkdownLabels>(() => ({
    code: { copyLabel: t('copy'), copiedLabel: t('copied') },
    footnotes: t('markdown.footnotes'),
  }), [t])
  return (
    <MarkdownText
      text={text}
      streaming={streaming}
      labels={labels}
      fileMentions={mentions}
      pathImages={pathImages}
      renderFence={renderFence}
    />
  )
})
