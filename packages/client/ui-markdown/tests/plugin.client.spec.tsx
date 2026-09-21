// @vitest-environment jsdom
/**
 * The markdown renderer as a composition: this plugin fills each surface's
 * markdown seat, the rules plugin fills the fence seat beside it, and a
 * document rendered through the pair reaches both. Diagrams never activate
 * here — activation would start the real Mermaid load — so the observer is
 * inert and the diagram assertions read the fence shell.
 */
import { act } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { COMMON_NS, LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import { en as commonEn } from '@deepseek-ai/dsh-client-locale/src/locales/en.ts'
import { zh as commonZh } from '@deepseek-ai/dsh-client-locale/src/locales/zh.ts'
import { SlotTestRuntime } from '@deepseek-ai/dsh-client-test-runtime'
import { apply as applyRules, inject as injectRules } from '../../ui-markdown-rules/src/client/index.ts'
import type { MarkdownSeatOwnerProps } from '../src/client/contract/slots.ts'
import { apply, inject } from '../src/client/index.ts'
import { apply as nodeApply } from '../src/index.ts'

/** Every surface pair the two plugins fill: one seat and one fence chain each. */
const PAIRS = [
  'conversation.chat.markdown',
  'conversation.composer.markdown',
  'conversation.trajectory.markdown',
  'sidebar.right.tab.document.markdown',
] as const

/** The document the frame renders, replaced per test before the runtime mounts. */
let seatOwner: Omit<MarkdownSeatOwnerProps, 'renderFence'>

const runtimes: SlotTestRuntime[] = []

/** Never fires: diagrams stay on their placeholder arm for the whole spec. */
class InertIntersectionObserver {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
  takeRecords(): IntersectionObserverEntry[] { return [] }
}

beforeEach(() => {
  vi.stubGlobal('IntersectionObserver', InertIntersectionObserver)
})

afterEach(async () => {
  for (const runtime of runtimes.splice(0)) await runtime.dispose()
  vi.unstubAllGlobals()
})

/**
 * Assemble a runtime with a real locale and a root frame declaring every
 * markdown pair, then mount both halves of the rendering.
 * @returns The runtime, both fiber handles, and the bound locale.
 */
async function mountMarkdown() {
  const runtime = await SlotTestRuntime.create()
  runtimes.push(runtime)
  const locale = new LocaleRuntime(runtime.ctx)
  runtime.ctx.provide('locale', locale)
  runtime.slots.installLocale(locale)
  locale.register(COMMON_NS, { zh: commonZh, en: commonEn })
  locale.setLocale('en')
  await runtime.sessions.add({ id: 'markdown-plugin' })
  const renderer = await runtime.mount({ inject: [...inject], apply })
  const rules = await runtime.mount({ inject: [...injectRules], apply: applyRules })
  await runtime.root.declare(
    {
      'conversation.chat.markdown': { kind: 'single', scope: 'session' },
      'conversation.chat.markdown.fence': { kind: 'chain', scope: 'session' },
      'conversation.composer.markdown': { kind: 'single', scope: 'session' },
      'conversation.composer.markdown.fence': { kind: 'chain', scope: 'session' },
      'conversation.trajectory.markdown': { kind: 'single', scope: 'session' },
      'conversation.trajectory.markdown.fence': { kind: 'chain', scope: 'session' },
      'sidebar.right.tab.document.markdown': { kind: 'single', scope: 'session' },
      'sidebar.right.tab.document.markdown.fence': { kind: 'chain', scope: 'session' },
    },
    ({ renderSlot, renderSlotChain }) => (
      <div>{renderSlot('conversation.chat.markdown', {
        ...seatOwner,
        renderFence: (request, fallback) => renderSlotChain(
          'conversation.chat.markdown.fence', request, { fallback }),
      }, { fallback: <span data-missing-markdown /> })}</div>
    ),
  )
  return { runtime, renderer, rules, locale }
}

describe('markdown renderer plugin', () => {
  it('fills every surface seat once the surface declares it, and releases it', async () => {
    seatOwner = { text: '# Title', streaming: false }
    const { runtime, renderer } = await mountMarkdown()
    for (const name of PAIRS) {
      expect(runtime.slots.entries(name)).toHaveLength(1)
      // The rules plugin occupied the fence seat beside it, and it stays:
      // the surface declared that slot, not this plugin.
      expect(runtime.slots.entries(`${name}.fence`)).toHaveLength(2)
    }

    await renderer.dispose()
    for (const name of PAIRS) {
      expect(runtime.slots.entries(name)).toEqual([])
      expect(runtime.slots.entries(`${name}.fence`)).toHaveLength(2)
    }
  })

  it('renders the document, its chrome copy, and a diagram fence through the declared pair', async () => {
    seatOwner = {
      text: ['# Notes', '', '```mermaid', 'graph TD', '  A --> B', '```', '', '$$a^2$$'].join('\n'),
      streaming: false,
    }
    const { runtime } = await mountMarkdown()
    const view = runtime.renderRoot()

    expect(view.getByRole('heading', { name: 'Notes' })).toBeDefined()
    expect(view.getByRole('button', { name: 'Copy' })).toBeDefined()
    // The rule claimed the fence: the block mounts its diagram arm (its
    // placeholder, because the observer never fires).
    expect(view.container.querySelector('[data-diagram-block]')).not.toBeNull()
    // And the math rule typeset the display node.
    expect(view.container.querySelector('.katex')).not.toBeNull()
    expect(view.container.querySelector('[data-missing-markdown]')).toBeNull()
  })

  it('leaves the seat unfilled when only the rules are mounted', async () => {
    seatOwner = { text: '# Notes', streaming: false }
    const runtime = await SlotTestRuntime.create()
    runtimes.push(runtime)
    const locale = new LocaleRuntime(runtime.ctx)
    runtime.ctx.provide('locale', locale)
    runtime.slots.installLocale(locale)
    await runtime.sessions.add({ id: 'markdown-rules-only' })
    await runtime.mount({ inject: [...injectRules], apply: applyRules })
    await runtime.declare({ 'conversation.chat.markdown': { kind: 'single', scope: 'session' } })
    const view = runtime.renderSlot('conversation.chat.markdown', {
      ...seatOwner,
      renderFence: () => null,
    }, { fallback: <span data-missing-markdown /> })

    expect(view.container.querySelector('[data-missing-markdown]')).not.toBeNull()
  })

  it('leaves a fence on the code arm while the reply streams', async () => {
    seatOwner = { text: '```mermaid\ngraph TD\n  A --> B\n```', streaming: true }
    const { runtime } = await mountMarkdown()
    const view = runtime.renderRoot()

    expect(view.container.querySelector('[data-diagram-block]')).toBeNull()
    expect(view.container.querySelector('pre')).not.toBeNull()
  })

  it('follows the active locale for its own chrome', async () => {
    seatOwner = { text: '```ts\nconst a = 1\n```', streaming: false }
    const { runtime, locale } = await mountMarkdown()
    const view = runtime.renderRoot()
    expect(view.getByRole('button', { name: 'Copy' })).toBeDefined()

    await act(async () => { locale.setLocale('zh') })
    expect(view.getByRole('button', { name: '复制' })).toBeDefined()
  })
})

describe('markdown renderer plugin node half', () => {
  it('has no host behavior to apply', () => {
    expect(() => { nodeApply() }).not.toThrow()
  })
})
