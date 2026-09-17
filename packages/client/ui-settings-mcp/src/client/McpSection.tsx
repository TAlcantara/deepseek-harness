/**
 * The MCP settings section: the roster list, its editor, the connectivity
 * test, and the removal confirmation. Presentation only — every fact arrives
 * through the injected face and the page store.
 *
 * @module
 */

import { useEffect, type ReactNode } from 'react'
import { Button, Switch, Tag } from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace } from '@deepseek-ai/dsh-client-ui-slots'
import type { McpServerDraft, McpServerView } from '@deepseek-ai/dsh-mcp-servers/types'
import type { McpSectionInjected } from './contract.ts'
import type { McpTranslate } from './locales.ts'
import { ServerEditor } from './ServerEditor.tsx'
import { TestOutcome } from './TestOutcome.tsx'
import { testStateOf, DRAFT_KEY, type McpServersState } from './store.ts'
import css from './McpSection.module.css'

type McpSectionFace = InjectFace<McpSectionInjected>

/** Props delivered by the settings shell's slot outlet. */
export type McpSectionProps = Partial<McpSectionFace>

/** The snapshot the row list renders from. */
type McpSnapshot = McpServersState

/**
 * Render the MCP settings section.
 * @param props - Slot-delivered injected dependencies.
 * @returns The section, or null while the shell has not injected yet.
 */
export function McpSection(props: McpSectionProps): ReactNode {
  const { operations, useSnapshot, t } = props
  if (operations === undefined || useSnapshot === undefined || t === undefined) return null
  return <Loaded operations={operations} useSnapshot={useSnapshot} t={t} />
}

/** The section once the inject face is present and hooks may run. */
function Loaded({ operations, useSnapshot, t }: McpSectionFace): ReactNode {
  const state = useSnapshot(snapshot => snapshot)
  // The page loads once, on first mount; later reads are user actions and
  // connection resets, which the registering plugin drives.
  useEffect(() => { void operations.load() }, [operations])

  return (
    <section className={css.section} aria-label={t('title')}>
      <header className={css.header}>
        <h3 className={css.heading}>{t('title')}</h3>
        <p className={css.subtitle}>{t('subtitle')}</p>
        {state.capabilities.canEdit && <Button variant="primary" onClick={() => { operations.openAdd() }}>{t('add')}</Button>}
      </header>

      {state.notice.length > 0 && (
        <p className={css.notice} role="status">
          {state.notice}
          <Button onClick={() => { operations.dismissNotice() }}>{t('action.cancel')}</Button>
        </p>
      )}

      {state.editor.mode !== 'closed' && (
        <ServerEditor
          mode={state.editor.mode}
          {...state.editor.mode === 'edit' ? { initial: findServer(state, state.editor.id) } : {}}
          writeError={state.writeError}
          testState={testStateOf(state, DRAFT_KEY)}
          t={t}
          onSaveAdd={async draft => await operations.add(draft)}
          onSaveEdit={async (id, patch) => await operations.update(id, patch)}
          onTest={(target) => { void operations.test(target, DRAFT_KEY) }}
          onClose={() => { operations.closeEditor() }}
        />
      )}

      {renderRoster(state, operations, t)}
    </section>
  )
}

/** Render the load states and the roster list. */
function renderRoster(
  state: McpSnapshot,
  operations: McpSectionFace['operations'],
  t: McpTranslate,
): ReactNode {
  if (state.status === 'failed') {
    return (
      <p className={css.failure} role="alert">
        {state.loadError}
        <Button onClick={() => { void operations.reload() }}>{t('retry')}</Button>
      </p>
    )
  }
  if (state.status !== 'ready') return <p className={css.status}>{t('loading')}</p>
  if (state.servers.length === 0) {
    return (
      <div className={css.empty}>
        <p>{t('empty.title')}</p>
        <p className={css.hint}>{t('empty.hint')}</p>
      </div>
    )
  }
  return (
    <ul className={css.list}>
      {state.servers.map(server => (
        <ServerRow
          key={server.id}
          server={server}
          state={state}
          canEdit={state.capabilities.canEdit}
          operations={operations}
          t={t}
        />
      ))}
    </ul>
  )
}

/** One roster row, with its own test, toggle, edit, and removal actions. */
function ServerRow({ server, state, canEdit, operations, t }: {
  server: McpServerView
  state: McpSnapshot
  canEdit: boolean
  operations: McpSectionFace['operations']
  t: McpTranslate
}): ReactNode {
  return (
    <li className={css.row}>
      <div className={css.identity}>
        <strong>{server.label.length > 0 ? server.label : server.serverName}</strong>
        <code className={css.namespace}>{server.serverName}</code>
        <Tag tone="outline">{server.transport === 'stdio' ? t('transport.stdio') : t('transport.http')}</Tag>
        <span className={css.summary}>{server.transport === 'stdio' ? server.command : server.url}</span>
      </div>
      <div className={css.meta}>
        <span>{server.enabled ? t('state.enabled') : t('state.disabled')}</span>
        {server.mountError !== undefined && (
          <span className={css.failure}>{t('state.mountError', { reason: server.mountError })}</span>
        )}
        <TestOutcome state={testStateOf(state, server.id)} t={t} />
      </div>
      <div className={css.actions}>
        <Button onClick={() => { void operations.test({ draft: savedDraft(server), basedOn: server.id }, server.id) }}>
          {t('test.action')}
        </Button>
        <Switch
          checked={server.enabled}
          disabled={!canEdit}
          label={t('state.enabled')}
          onChange={(next) => { void operations.setEnabled(server.id, next) }}
        />
        {canEdit && <Button onClick={() => { operations.openEdit(server.id) }}>{t('action.edit')}</Button>}
        {canEdit && <Button onClick={() => { operations.askRemove(server.id) }}>{t('action.remove')}</Button>}
      </div>
      {state.pendingRemove === server.id && (
        <div className={css.confirm} role="alertdialog" aria-label={t('action.remove')}>
          <p>{t('confirm.remove')}</p>
          <Button variant="primary" onClick={() => { void operations.remove(server.id) }}>{t('action.remove')}</Button>
          <Button onClick={() => { operations.cancelRemove() }}>{t('action.cancel')}</Button>
        </div>
      )}
    </li>
  )
}

/** Find one server in the current snapshot. */
function findServer(state: McpSnapshot, id: string): McpServerView | undefined {
  return state.servers.find(server => server.id === id)
}

/**
 * Build the draft a saved row's test submits. Secret values are absent by
 * design: the Host fills them from the stored entry the target names.
 * @param server - The saved server's view.
 * @returns The draft a connectivity test can submit.
 */
function savedDraft(server: McpServerView): McpServerDraft {
  return {
    serverName: server.serverName,
    enabled: server.enabled,
    label: server.label,
    transport: server.transport,
    command: server.command,
    args: server.args,
    cwd: server.cwd,
    url: server.url,
    toolCallTimeoutMs: server.toolCallTimeoutMs,
    failOnStartupError: server.failOnStartupError,
  }
}
