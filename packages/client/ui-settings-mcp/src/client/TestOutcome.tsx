/**
 * Connectivity-test presentation: one line describing the last test of a
 * server or of the editor's draft.
 *
 * @module
 */

import type { ReactNode } from 'react'
import type { McpTranslate } from './locales.ts'
import type { McpTestState } from './store.ts'

/** Props for {@link TestOutcome}. */
export interface TestOutcomeProps {
  /** The recorded test state for this target. */
  state: McpTestState
  /** The bound translate seat. */
  t: McpTranslate
}

/**
 * Render one test outcome.
 * @param props - Test state and translate seat.
 * @returns The outcome line.
 */
export function TestOutcome({ state, t }: TestOutcomeProps): ReactNode {
  if (state.phase === 'running') return <span aria-live="polite">{t('test.running')}</span>
  if (state.phase === 'idle') return <span>{t('test.untested')}</span>
  const { result } = state
  if (!result.ok) return <span role="status">{t('test.failed', { reason: result.error ?? '' })}</span>
  return (
    <span role="status">
      {result.tools.length === 0 ? t('test.ok.none') : t('test.ok', { count: result.tools.length })}
    </span>
  )
}
