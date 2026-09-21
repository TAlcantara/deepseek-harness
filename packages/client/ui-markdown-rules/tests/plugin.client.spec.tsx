// @vitest-environment jsdom
/**
 * The built-in fence rules as a plugin: each rule registers into every fence
 * seat a surface declares, claims only the requests it owns, and leaves with
 * its fiber. Diagrams never activate here — activation would start the real
 * Mermaid load — so the observer is inert.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { COMMON_NS, LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import { en as commonEn } from '@deepseek-ai/dsh-client-locale/src/locales/en.ts'
import { zh as commonZh } from '@deepseek-ai/dsh-client-locale/src/locales/zh.ts'
import { SlotTestRuntime } from '@deepseek-ai/dsh-client-test-runtime'
import type { MarkdownFenceRequest } from '@deepseek-ai/dsh-client-ui-markdown/client'
import { apply, inject } from '../src/client/index.ts'
import { selectMath } from '../src/client/rules/MathFence.tsx'
import { selectMermaid } from '../src/client/rules/MermaidFence.tsx'
import { apply as nodeApply } from '../src/index.ts'

/** Every fence seat a markdown surface declares. */
const SEATS = [
  'conversation.chat.markdown.fence',
  'conversation.composer.markdown.fence',
  'conversation.trajectory.markdown.fence',
  'sidebar.right.tab.document.markdown.fence',
] as const

const runtimes: SlotTestRuntime[] = []

/** Never fires: diagrams stay on their placeholder arm for the whole spec. */
class InertIntersectionObserver {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
  takeRecords(): IntersectionObserverEntry[] { return [] }
}

/** The request the frame dispatches, replaced per test before the runtime renders. */
let request: MarkdownFenceRequest

beforeEach(() => {
  vi.stubGlobal('IntersectionObserver', InertIntersectionObserver)
})

afterEach(async () => {
  for (const runtime of runtimes.splice(0)) await runtime.dispose()
  vi.unstubAllGlobals()
})

/**
 * Assemble a runtime whose root frame declares every fence seat, then mount the
 * rules plugin onto it.
 * @returns The runtime and the mounted plugin handle.
 */
async function mountRules() {
  const runtime = await SlotTestRuntime.create()
  runtimes.push(runtime)
  const locale = new LocaleRuntime(runtime.ctx)
  runtime.ctx.provide('locale', locale)
  runtime.slots.installLocale(locale)
  locale.register(COMMON_NS, { zh: commonZh, en: commonEn })
  locale.setLocale('en')
  await runtime.sessions.add({ id: 'markdown-rules' })
  const feature = await runtime.mount({ inject: [...inject], apply })
  await runtime.root.declare(
    Object.fromEntries(SEATS.map(seat => [seat, { kind: 'chain', scope: 'session' }])) as never,
    ({ renderSlotChain }) => (
      <div>{renderSlotChain(SEATS[0], request, { fallback: <span data-fence-fallback /> })}</div>
    ),
  )
  return { runtime, feature }
}

describe('markdown fence rules plugin', () => {
  it('claims a seat only once a surface declares it, and releases it', async () => {
    const { runtime, feature } = await mountRules()
    for (const seat of SEATS) {
      expect(runtime.slots.entries(seat)).toHaveLength(2)
    }

    await feature.dispose()
    for (const seat of SEATS) {
      expect(runtime.slots.entries(seat)).toEqual([])
    }
  })

  it('waits for a seat that no surface has declared yet', async () => {
    const runtime = await SlotTestRuntime.create()
    runtimes.push(runtime)
    const locale = new LocaleRuntime(runtime.ctx)
    runtime.ctx.provide('locale', locale)
    runtime.slots.installLocale(locale)
    await runtime.mount({ inject: [...inject], apply })
    for (const seat of SEATS) {
      expect(runtime.slots.entries(seat)).toEqual([])
    }

    await runtime.declare({ [SEATS[0]]: { kind: 'chain', scope: 'session' } })
    expect(runtime.slots.entries(SEATS[0])).toHaveLength(2)
    // The other seats stay empty: each contribution waits on its own declaration.
    expect(runtime.slots.entries(SEATS[1])).toEqual([])
  })
})

describe('selectMath', () => {
  const request = (value: MarkdownFenceRequest): MarkdownFenceRequest => value

  it('takes both math node kinds and a settled math fence', () => {
    expect(selectMath(request({ kind: 'inline', source: 'a' }))).toEqual({ source: 'a', display: false })
    expect(selectMath(request({ kind: 'display', source: 'b' }))).toEqual({ source: 'b', display: true })
    // A fence body keeps the trailing newline the replaced pipeline's text extraction saw.
    expect(selectMath(request({ kind: 'fence', lang: 'math', info: 'math', source: 'c', streaming: false })))
      .toEqual({ source: 'c\n', display: true })
  })

  it('declines an incomplete fence and every other language', () => {
    expect(selectMath(request({ kind: 'fence', lang: 'math', info: 'math', source: 'c', streaming: true }))).toBeNull()
    expect(selectMath(request({ kind: 'fence', lang: 'ts', info: 'ts', source: 'd', streaming: false }))).toBeNull()
    expect(selectMath(request({ kind: 'fence', lang: undefined, info: '', source: 'd', streaming: false }))).toBeNull()
  })
})

describe('selectMermaid', () => {
  it('takes a settled mermaid fence and declines anything else', () => {
    const fence = (lang: string | undefined, streaming: boolean): MarkdownFenceRequest =>
      ({ kind: 'fence', lang, info: lang ?? '', source: 'graph TD', streaming })
    expect(selectMermaid(fence('mermaid', false))).toBe('graph TD')
    expect(selectMermaid(fence('mermaid', true))).toBeNull()
    expect(selectMermaid(fence('math', false))).toBeNull()
    expect(selectMermaid({ kind: 'display', source: 'a^2' })).toBeNull()
    expect(selectMermaid({ kind: 'inline', source: 'a^2' })).toBeNull()
  })
})

describe('rules through the fence seat', () => {
  it('takes the diagram arm for the fence the Mermaid rule claims', async () => {
    request = { kind: 'fence', lang: 'mermaid', info: 'mermaid', source: 'graph TD\n  A --> B', streaming: false }
    const { runtime } = await mountRules()
    const view = runtime.renderRoot()

    expect(view.container.querySelector('[data-diagram-state="pending"]')).not.toBeNull()
    expect(view.container.querySelector('pre')).not.toBeNull()
  })

  it('typesets a display math node', async () => {
    request = { kind: 'display', source: 'a^2' }
    const { runtime } = await mountRules()
    const view = runtime.renderRoot()

    expect(view.container.querySelector('.katex')).not.toBeNull()
    expect(view.container.querySelector('.katex-display')).not.toBeNull()
  })

  it('keeps the renderer fallback for a fence no rule claims', async () => {
    request = { kind: 'fence', lang: 'ts', info: 'ts', source: 'const a = 1', streaming: false }
    const { runtime } = await mountRules()
    const view = runtime.renderRoot()

    expect(view.container.querySelector('[data-fence-fallback]')).not.toBeNull()
    expect(view.container.querySelector('.katex')).toBeNull()
    expect(view.container.querySelector('[data-diagram-block]')).toBeNull()
  })
})

describe('markdown fence rules plugin node half', () => {
  it('has no host behavior to apply', () => {
    expect(() => { nodeApply() }).not.toThrow()
  })
})
