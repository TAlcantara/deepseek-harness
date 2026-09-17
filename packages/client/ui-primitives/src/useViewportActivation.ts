/**
 * Viewport activation for expensive, lazily built render output. One
 * document-wide `IntersectionObserver` serves every registered surface;
 * an element activates on its first intersection and is unobserved
 * permanently, so activation lasts for the component's lifetime and a
 * scroll past a surface never re-arms it.
 *
 * @module @deepseek-ai/dsh-client-ui-primitives/useViewportActivation
 */

import { useCallback, useEffect, useState } from 'react'
import type { RefObject } from 'react'

const noop = (): void => {}

/** One document-wide observer; activated elements leave it permanently. */
class ViewportActivation {
  private observer: IntersectionObserver | undefined
  private readonly activators = new Map<Element, () => void>()

  observe(element: Element, activate: () => void): () => void {
    if (typeof IntersectionObserver === 'undefined') {
      activate()
      return noop
    }
    this.observer ??= new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue
        const current = this.activators.get(entry.target)
        /* v8 ignore next -- the observer reports only elements still registered with it. */
        if (current === undefined) continue
        this.activators.delete(entry.target)
        this.observer?.unobserve(entry.target)
        current()
      }
      this.releaseEmptyObserver()
    })
    this.activators.set(element, activate)
    this.observer.observe(element)
    return () => {
      this.activators.delete(element)
      this.observer?.unobserve(element)
      this.releaseEmptyObserver()
    }
  }

  private releaseEmptyObserver(): void {
    if (this.activators.size > 0) return
    this.observer?.disconnect()
    this.observer = undefined
  }
}

const viewportActivation = new ViewportActivation()

/**
 * Activate one surface when it first intersects the viewport. Activation lasts
 * for the component lifetime; browsers without `IntersectionObserver` activate
 * immediately.
 *
 * The caller's placeholder rendering must reserve the surface's geometry, so
 * activation replaces content in place rather than moving everything below it.
 *
 * @param target - Element whose visibility gates the work.
 * @param enabled - Whether this surface has expensive work to defer at all.
 * @returns Whether the caller may build its expensive output now.
 */
export function useViewportActivation(
  target: RefObject<Element>,
  enabled: boolean,
): boolean {
  const [activated, setActivated] = useState(false)
  const activate = useCallback(() => { setActivated(true) }, [])

  useEffect(() => {
    if (!enabled || activated) return
    const element = target.current
    /* v8 ignore next -- React attaches the host ref before running effects. */
    if (element === null) return
    return viewportActivation.observe(element, activate)
  }, [activate, activated, enabled, target])

  return enabled && activated
}
