// @vitest-environment jsdom
/**
 * The markdown plugin as a whole: it fills every surface's markdown pair with
 * one seat and its built-in fence rules, dispatch reaches those rules through
 * the real slot registry, and unloading the plugin releases every contribution.
 *
 * Diagrams never activate here — activation would start the real Mermaid load —
 * so the observer is inert and the diagram assertions read the fence shell.
 */
import { act } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { COMMON_NS, LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import { en as commonEn } from '@deepseek-ai/dsh-client-locale/src/locales/en.ts'
import { zh as commonZh } from '@deepseek-ai/dsh-client-locale/src/locales/zh.ts'
import { SlotTestRuntime } from '@deepseek-ai/dsh-client-test-runtime'
import type { MarkdownSeatOwnerProps } from '../src/client/contract/slots.ts'
import { apply, inject } from '../src/client/index.ts'
import { apply as nodeApply } from '../src/index.ts'

/** Every surface pair the plugin fills: one seat and one fence chain each. */
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
 * markdown pair, then mount the plugin onto it.
 * @returns The runtime, the plugin's fiber handle, and the bound locale.
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
  const feature = await runtime.mount({ inject: [...inject], apply })
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
  return { runtime, feature, locale }
}

describe('markdown plugin registration', () => {
  it('fills every surface pair once the surface declares it, and releases all of it', async () => {
    seatOwner = { text: '# Title', streaming: false }
    const { runtime, feature } = await mountMarkdown()
    for (const name of PAIRS) {
      expect(runtime.slots.entries(name)).toHaveLength(1)
      // Both built-in rules occupy each fence chain; the chain elects by
      // selector, not by registration order.
      expect(runtime.slots.entries(`${name}.fence`)).toHaveLength(2)
    }

    await feature.dispose()
    for (const name of PAIRS) {
      expect(runtime.slots.entries(name)).toEqual([])
      expect(runtime.slots.entries(`${name}.fence`)).toEqual([])
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

describe('markdown plugin node half', () => {
  it('has no host behavior to apply', () => {
    expect(() => { nodeApply() }).not.toThrow()
  })
})
