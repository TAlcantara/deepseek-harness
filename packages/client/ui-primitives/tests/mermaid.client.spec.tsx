// @vitest-environment jsdom
// Mermaid cannot lay out under jsdom (no SVG text metrics), so the lazy
// `import('mermaid')` is replaced with a stub that returns a canned SVG. These
// specs therefore cover this package's own behavior — the streaming gate, the
// viewport gate, caching, instance-id rewriting, failure fallback — and the
// browser suite covers Mermaid actually drawing.
//
// The module under test is imported once for the whole file: its loader and
// render cache are module state that a per-test module reset would discard,
// which both weakens the specs and hides executed lines from coverage. Tests
// therefore use their own fence sources and assert relative cache behavior.
import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type * as Md from 'mdast'
import { CACHE_LIMIT, MermaidBlock } from '../src/markdown/mermaid.tsx'
import { createReferenceTargets, renderBlocks } from '../src/markdown/render.tsx'
import { markdownLabels } from './labels.client.ts'

const mermaid = vi.hoisted(() => ({ initialize: vi.fn(), render: vi.fn() }))

vi.mock('mermaid', () => ({
  default: { initialize: mermaid.initialize, render: mermaid.render },
}))

/** Canned diagram output: an SVG root carrying the fixed render id, one node, and one label. */
const RENDERED_SVG = [
  '<svg id="dsh-mermaid" xmlns="http://www.w3.org/2000/svg" class="flowchart">',
  '<style>#dsh-mermaid .node rect { fill: #fff; }</style>',
  '<g class="node"><rect class="basic" x="1" y="2" width="30" height="10"/></g>',
  '<text class="nodeLabel">Start</text>',
  '</svg>',
].join('')

class IntersectionObserverStub {
  static instances: IntersectionObserverStub[] = []

  readonly observed = new Set<Element>()
  disconnected = false

  constructor(private readonly callback: IntersectionObserverCallback) {
    IntersectionObserverStub.instances.push(this)
  }

  observe(element: Element): void {
    this.observed.add(element)
  }

  unobserve(element: Element): void {
    this.observed.delete(element)
  }

  disconnect(): void {
    this.disconnected = true
    this.observed.clear()
  }

  takeRecords(): IntersectionObserverEntry[] {
    return []
  }

  intersect(element: Element): void {
    this.callback(
      [{ target: element, isIntersecting: true } as IntersectionObserverEntry],
      this as unknown as IntersectionObserver,
    )
  }
}

beforeEach(() => {
  // `initialize` keeps its history across tests: the loader runs once per
  // module instance, and that single call is the fact under test.
  mermaid.render.mockReset()
  mermaid.render.mockResolvedValue({ svg: RENDERED_SVG })
  IntersectionObserverStub.instances = []
  vi.stubGlobal('IntersectionObserver', IntersectionObserverStub)
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

/** Mount one fence and hand back its placeholder element. */
function mount(source: string) {
  const view = render(<MermaidBlock source={source} labels={markdownLabels} />)
  const placeholder = view.container.querySelector('[data-diagram-block]')
  expect(placeholder).not.toBeNull()
  return { view, placeholder: placeholder as Element }
}

/** Activate one surface through the shared module-level viewport observer. */
function activate(target: Element): void {
  const observer = IntersectionObserverStub.instances[0]
  expect(observer).toBeDefined()
  act(() => { observer!.intersect(target) })
}

describe('MermaidBlock', () => {
  it('stays on the code arm until the fence scrolls into view', async () => {
    const { view, placeholder } = mount('graph TD\n  A --> B')
    expect(placeholder).not.toBeNull()
    expect(view.container.querySelector('svg')).toBeNull()
    expect(view.container.querySelector('pre')).not.toBeNull()
    expect(mermaid.render).not.toHaveBeenCalled()
  })

  it('keeps the observed placeholder a real box', () => {
    // These specs stub IntersectionObserver and jsdom has no layout, so a
    // `display: contents` placeholder would pass every other test here while
    // breaking production: the element reports a 0x0 rect, never intersects,
    // and every diagram stays on the code arm forever. Pin the declaration.
    const sheet = readFileSync('packages/client/ui-primitives/src/markdown/DiagramBlock.module.css', 'utf8')
    const pending = /\.pending\s*\{([^}]*)\}/.exec(sheet)?.[1] ?? ''
    expect(pending).not.toBe('')
    expect(pending).not.toContain('display: contents')
    expect(pending).toContain('display: block')
  })

  it('renders the SVG once activated, without any HTML island', async () => {
    const { view, placeholder } = mount('graph TD\n  A --> B')
    activate(placeholder)
    await waitFor(() => { expect(view.container.querySelector('svg')).not.toBeNull() })
    expect(view.container.querySelector('foreignObject')).toBeNull()
    expect(view.container.querySelector('.node rect')).not.toBeNull()
    expect(mermaid.render).toHaveBeenCalledTimes(1)
  })

  it('configures Mermaid once, strictly and token-themed', async () => {
    const { placeholder } = mount('graph TD\n  Config --> Probe')
    activate(placeholder)
    await waitFor(() => { expect(mermaid.render).toHaveBeenCalled() })
    expect(mermaid.initialize).toHaveBeenCalledTimes(1)
    const config = mermaid.initialize.mock.calls[0]![0] as Record<string, unknown>
    expect(config['securityLevel']).toBe('strict')
    expect(config['suppressErrorRendering']).toBe(true)
    expect(config['htmlLabels']).toBe(false)
    expect(config['startOnLoad']).toBe(false)
    expect(config['theme']).toBe('base')
    expect(config['fontFamily']).toBe('var(--dsw-font-family)')
    const themeCss = config['themeCSS'] as string
    expect(themeCss).toContain('var(--dsw-')
    // Mermaid scopes its own rules by the render id, which outranks plain class
    // selectors on specificity alone; the override needs `!important`.
    for (const declaration of themeCss.split('\n').filter(line => line.includes(':'))) {
      expect(declaration).toContain('!important')
    }
  })

  it('falls back to the code arm when the render rejects, and does not retry', async () => {
    mermaid.render.mockRejectedValue(new Error('syntax error'))
    const source = 'graph TD\n  Broken -->'
    const { view, placeholder } = mount(source)
    activate(placeholder)
    await waitFor(() => {
      expect(view.container.querySelector('[data-diagram-state="failed"]')).not.toBeNull()
    })
    expect(view.container.querySelector('svg')).toBeNull()
    expect(view.container.querySelector('pre')).not.toBeNull()
    // The failure is terminal: re-rendering the same instance must not re-run a
    // render that already failed.
    view.rerender(<MermaidBlock source={source} labels={markdownLabels} />)
    expect(mermaid.render).toHaveBeenCalledTimes(1)
  })

  it('serves a second concurrent mount of the same source from the cache', async () => {
    const source = 'graph TD\n  Race --> Both'
    // Both mount against an empty cache, so both miss on their initial read.
    const first = mount(source)
    const second = mount(source)
    activate(first.placeholder)
    await waitFor(() => { expect(first.view.container.querySelector('svg')).not.toBeNull() })
    activate(second.placeholder)
    await waitFor(() => { expect(second.view.container.querySelector('svg')).not.toBeNull() })
    // The second effect found the first mount's entry rather than rendering again.
    expect(mermaid.render).toHaveBeenCalledTimes(1)
  })

  it('falls back to the code arm when the rendered markup has no root element', async () => {
    mermaid.render.mockResolvedValue({ svg: '   ' })
    const { view, placeholder } = mount('graph TD\n  Empty -->')
    activate(placeholder)
    await waitFor(() => { expect(mermaid.render).toHaveBeenCalledTimes(1) })
    expect(view.container.querySelector('svg')).toBeNull()
    expect(view.container.querySelector('pre')).not.toBeNull()
  })

  it('reuses one render across mounts of the same source', async () => {
    const source = 'graph TD\n  Shared --> Node'
    const first = mount(source)
    activate(first.placeholder)
    await waitFor(() => { expect(first.view.container.querySelector('svg')).not.toBeNull() })

    const second = mount(source)
    // The cache is consulted during the first render, so the diagram is present
    // before any activation or await.
    expect(second.view.container.querySelector('svg')).not.toBeNull()
    expect(mermaid.render).toHaveBeenCalledTimes(1)
  })

  it('gives each mount its own scoped id', async () => {
    const source = 'graph TD\n  Same --> Source'
    const first = mount(source)
    activate(first.placeholder)
    await waitFor(() => { expect(first.view.container.querySelector('svg')).not.toBeNull() })

    // Second mount is a cache hit, so no observer is registered — but it must
    // still scope the stylesheet to its own instance.
    const second = mount(source)
    expect(second.view.container.querySelector('svg')).not.toBeNull()

    const ids = [first, second].map(({ view }) => view.container.querySelector('svg')!.id)
    expect(ids[0]).not.toBe(ids[1])
    for (const id of ids) {
      expect(id).toMatch(/^dsh-mermaid-[A-Za-z0-9_-]+$/)
      // The scoped stylesheet must name that mount's own id, not the render id.
      expect(id).not.toBe('dsh-mermaid')
    }
    const firstCss = first.view.container.querySelector('style')?.textContent ?? ''
    expect(firstCss).toContain(`#${ids[0]}`)
    expect(firstCss).not.toContain('#dsh-mermaid ')
  })

  it('drops a render that settles after unmount', async () => {
    let settle: ((value: { svg: string }) => void) | undefined
    mermaid.render.mockImplementation(() => new Promise((resolve) => { settle = resolve }))
    const { view, placeholder } = mount('graph TD\n  Slow --> Node')
    activate(placeholder)
    await waitFor(() => { expect(mermaid.render).toHaveBeenCalledTimes(1) })
    view.unmount()
    await act(async () => { settle!({ svg: RENDERED_SVG }) })
    expect(view.container.querySelector('svg')).toBeNull()
  })

  it('drops a rejected render that settles after unmount', async () => {
    let fail: ((reason: Error) => void) | undefined
    mermaid.render.mockImplementation(() => new Promise((_resolve, reject) => { fail = reject }))
    const { view, placeholder } = mount('graph TD\n  Slow --> Fail')
    activate(placeholder)
    await waitFor(() => { expect(mermaid.render).toHaveBeenCalledTimes(1) })
    view.unmount()
    await act(async () => { fail!(new Error('late')) })
    expect(view.container.querySelector('[data-diagram-state="failed"]')).toBeNull()
  })

  it('copies the fence source and confirms on the button', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
    const { view, placeholder } = mount('graph TD\n  Copy --> Me')
    activate(placeholder)
    await waitFor(() => { expect(view.container.querySelector('svg')).not.toBeNull() })

    const button = view.container.querySelector('button')!
    expect(button.textContent).toBe(markdownLabels.code.copyLabel)
    // Fake timers only now: the confirmation window is the part under test.
    vi.useFakeTimers()
    fireEvent.click(button)
    expect(writeText).toHaveBeenCalledWith('graph TD\n  Copy --> Me')
    await act(async () => { await Promise.resolve() })
    expect(button.textContent).toBe(markdownLabels.code.copiedLabel)
    await vi.advanceTimersByTimeAsync(1000)
    expect(button.textContent).toBe(markdownLabels.code.copyLabel)
  })

  it('does not claim a copy the host refused', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error('denied'))
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
    const { view, placeholder } = mount('graph TD\n  Denied --> Me')
    activate(placeholder)
    await waitFor(() => { expect(view.container.querySelector('svg')).not.toBeNull() })

    const button = view.container.querySelector('button')!
    fireEvent.click(button)
    await act(async () => { await Promise.resolve() })
    expect(button.textContent).toBe(markdownLabels.code.copyLabel)
  })

  it('evicts the least recently rendered source once the cache is full', async () => {
    // More than the capacity, so every source cached by an earlier test is
    // pushed out and only these entries decide the outcome.
    const sources = Array.from({ length: CACHE_LIMIT + 5 }, (_, index) => `graph TD\n  ${index} --> End`)
    for (const source of sources) {
      const { view, placeholder } = mount(source)
      activate(placeholder)
      await waitFor(() => { expect(view.container.querySelector('svg')).not.toBeNull() })
      view.unmount()
    }
    expect(mermaid.render).toHaveBeenCalledTimes(sources.length)

    // The earliest source fell out of the cache and must render again…
    const evicted = mount(sources[0]!)
    activate(evicted.placeholder)
    await waitFor(() => { expect(mermaid.render).toHaveBeenCalledTimes(sources.length + 1) })
    expect(evicted.view.container.querySelector('svg')).not.toBeNull()

    // …while the most recent one is still cached.
    const retained = mount(sources[sources.length - 1]!)
    expect(retained.view.container.querySelector('svg')).not.toBeNull()
    expect(mermaid.render).toHaveBeenCalledTimes(sources.length + 1)
  })
})

describe('renderCode mermaid gate', () => {
  function renderFence(node: Md.Code, streaming: boolean): HTMLElement {
    const { container } = render(<div>{renderBlocks(
      [{ node, key: 0 }],
      {
        streaming,
        labels: markdownLabels,
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
