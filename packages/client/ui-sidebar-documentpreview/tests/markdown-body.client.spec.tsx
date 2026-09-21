// @vitest-environment jsdom
/** MarkdownBody hosts the renderer's seat over the document owner's accumulated text. */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import type { ReactNode } from 'react'
import type { ChainRenderOpts } from '@deepseek-ai/dsh-client-ui-slots'
import type { MarkdownFenceRequest, MarkdownSeatOwnerProps } from '@deepseek-ai/dsh-client-ui-markdown/client'
import { MarkdownBody, type MarkdownBodyProps } from '../src/client/markdown/MarkdownBody.tsx'
import type { DocumentContent } from '../src/client/document/contract.ts'

afterEach(cleanup)

function content(pageTexts: readonly string[], eof: boolean): DocumentContent {
  let offset = 1
  const pages = pageTexts.map((text) => {
    const lines = text.split('\n').length
    const page = { offset, text, lines }
    offset += lines
    return page
  })
  return { kind: 'text', text: pageTexts.join('\n'), pages, eof }
}

// Seat and fence doubles: this body owns the wiring between the document
// owner and the seat it declares, and the renderer behind the seat has its own
// suite. The remaining standard seats belong to the slot integration tests.
function props(value: DocumentContent) {
  const owners: MarkdownSeatOwnerProps[] = []
  const fences: MarkdownFenceRequest[] = []
  const renderSlot = vi.fn((_key: string, owner: MarkdownSeatOwnerProps): ReactNode => {
    owners.push(owner)
    return <span data-seat data-streaming={owner.streaming}>{owner.text}</span>
  })
  const renderSlotChain = vi.fn(
    (_key: string, request: MarkdownFenceRequest, opts?: ChainRenderOpts): ReactNode => {
      fences.push(request)
      // No rule is registered in this double, so every request declines and the
      // chain draws the fallback the renderer handed the surface.
      return opts?.fallback ?? null
    },
  )
  return {
    owners,
    fences,
    renderSlot,
    renderSlotChain,
    props: {
      resourceAddress: 'dsh-resource://file/session/markdown/notes.md',
      content: value, wrap: false, renderSlot, renderSlotChain,
    } as unknown as MarkdownBodyProps,
  }
}

describe('MarkdownBody', () => {
  it('renders the seat over the accumulated text and mirrors EOF as the streaming flag', () => {
    const page = props(content(['# Notes', 'Body.'], false))
    const view = render(<MarkdownBody {...page.props} />)
    expect(view.container.querySelector('[data-document-markdown]')).not.toBeNull()
    expect(view.container.querySelector('[data-seat]')?.textContent).toBe('# Notes\nBody.')
    expect(view.container.querySelector('[data-seat]')?.getAttribute('data-streaming')).toBe('true')

    view.rerender(<MarkdownBody {...page.props} content={content(['# Notes', 'Body.'], true)} />)
    expect(view.container.querySelector('[data-seat]')?.getAttribute('data-streaming')).toBe('false')
  })

  it('keeps one fence renderer across page arrivals and routes fence requests to the declared fence seat', () => {
    const page = props(content(['Intro.'], false))
    const view = render(<MarkdownBody {...page.props} />)
    const fence = page.owners[0]?.renderFence
    expect(fence).toBeDefined()

    view.rerender(<MarkdownBody {...page.props} content={content(['Intro.', 'More.'], false)} />)
    expect(page.owners[1]?.renderFence).toBe(fence)

    const request: MarkdownFenceRequest = { kind: 'fence', lang: 'ts', info: 'ts', source: 'const value = 1', streaming: false }
    const fallback = <span data-fence-fallback />
    expect(fence?.(request, fallback)).toBe(fallback)
    expect(page.renderSlotChain).toHaveBeenCalledWith(
      'sidebar.right.tab.document.markdown.fence', request, { fallback },
    )
    expect(page.fences).toEqual([request])
  })

  it('renders empty text and leaves non-text deliveries to their selected implementation', () => {
    const view = render(<MarkdownBody {...props({ kind: 'text', text: '', pages: [], eof: true }).props} />)
    expect(view.container.querySelector('[data-seat]')?.textContent).toBe('')

    const bytes = props({ kind: 'bytes', data: new TextEncoder().encode('text') })
    view.rerender(<MarkdownBody {...bytes.props} />)
    expect(view.container.childElementCount).toBe(0)
    expect(bytes.renderSlot).not.toHaveBeenCalled()
  })
})
