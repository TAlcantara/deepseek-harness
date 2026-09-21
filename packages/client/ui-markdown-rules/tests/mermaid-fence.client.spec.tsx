// @vitest-environment jsdom
// The gate between the renderer and a fence rule: whether the renderer hands a
// request to the rule at all. Nothing here may activate the diagram block — a
// viewport activation starts the real Mermaid load — so the observer is inert
// and every assertion reads the dispatch result, not a drawn diagram.
import { cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type * as Md from 'mdast'
import { createReferenceTargets, renderBlocks } from '../../ui-markdown/src/client/markdown/render.tsx'
import { markdownLabels } from '../../ui-markdown/tests/labels.client.ts'
import { testRenderFence } from '../../ui-markdown/tests/markdown-test-components.tsx'

/** Never fires: the block stays on its placeholder arm for the whole spec. */
class InertIntersectionObserver {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
  takeRecords(): IntersectionObserverEntry[] { return [] }
}

beforeEach(() => {
  vi.stubGlobal('IntersectionObserver', InertIntersectionObserver)
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('renderCode mermaid gate', () => {
  function renderFence(node: Md.Code, streaming: boolean): HTMLElement {
    const { container } = render(<div>{renderBlocks(
      [{ node, key: 0 }],
      {
        streaming,
        labels: markdownLabels,
        renderFence: testRenderFence,
        fileMentions: undefined,
        pathImages: undefined,
        targets: createReferenceTargets(),
        footnoteOrder: [],
        footnoteCounts: new Map(),
      },
    )}</div>)
    return container
  }

  it('keeps the fence as code while the reply streams', () => {
    const container = renderFence({ type: 'code', lang: 'mermaid', value: 'graph TD\n  A --> B' }, true)
    expect(container.querySelector('[data-diagram-block]')).toBeNull()
    expect(container.querySelector('pre')).not.toBeNull()
  })

  it('takes the diagram arm on the settled pass', () => {
    const container = renderFence({ type: 'code', lang: 'mermaid', value: 'graph TD\n  A --> B' }, false)
    expect(container.querySelector('[data-diagram-block]')).not.toBeNull()
    expect(container.querySelector('pre')).not.toBeNull()
  })

  it('leaves every other fence language on the code arm', () => {
    const container = renderFence({ type: 'code', lang: 'ts', value: 'const a = 1' }, false)
    expect(container.querySelector('[data-diagram-block]')).toBeNull()
  })
})

