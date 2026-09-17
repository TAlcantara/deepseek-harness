/**
 * The add/edit form for one MCP server: the transport-specific field set, the
 * write-only secret variables, the connectivity test, and the save action.
 *
 * @module
 */

import { useState, type FormEvent, type ReactNode } from 'react'
import { Button, Input } from '@deepseek-ai/dsh-client-ui-primitives'
import type { McpServerDraft, McpServerPatch, McpServerView, McpTestTarget } from '@deepseek-ai/dsh-mcp-servers/types'
import type { McpTranslate } from './locales.ts'
import { TestOutcome } from './TestOutcome.tsx'
import type { McpTestState } from './store.ts'
import css from './McpSection.module.css'

/** Default per-tool-call timeout the form starts from, mirroring the bridge. */
const DEFAULT_TIMEOUT_MS = 60_000

/** The editor's form values; every field is a string so inputs stay controlled. */
export interface McpEditorForm {
  /** Model-facing namespace; editable only while adding. */
  serverName: string
  /** Display name. */
  label: string
  /** Which field set the form shows. */
  transport: 'stdio' | 'streamable-http'
  /** stdio executable. */
  command: string
  /** stdio arguments, one per line. */
  args: string
  /** stdio working directory. */
  cwd: string
  /** Streamable HTTP endpoint. */
  url: string
  /** New environment variables, one `NAME=value` per line. */
  envAdd: string
  /** New request headers, one `NAME=value` per line. */
  headersAdd: string
  /** Stored environment variables marked for removal. */
  envRemove: string[]
  /** Stored request headers marked for removal. */
  headersRemove: string[]
  /** Per-tool-call timeout in milliseconds. */
  timeout: string
}

/** Props for {@link ServerEditor}. */
export interface ServerEditorProps {
  /** Whether the form is adding a server or editing one. */
  mode: 'add' | 'edit'
  /** The server being edited; absent while adding. */
  initial?: McpServerView | undefined
  /** Localized write failure to show inside the form; empty when none. */
  writeError: string
  /** The draft's connectivity-test state. */
  testState: McpTestState
  /** The bound translate seat. */
  t: McpTranslate
  /** Save a new server; resolves true when the write landed. */
  onSaveAdd: (draft: McpServerDraft) => Promise<boolean>
  /** Save an edit; resolves true when the write landed. */
  onSaveEdit: (id: string, patch: McpServerPatch) => Promise<boolean>
  /** Test the form's current contents. */
  onTest: (target: McpTestTarget) => void
  /** Close the editor. */
  onClose: () => void
}

/**
 * Seed the form from an existing server, or from the bridge defaults.
 * @param initial - The server being edited, when any.
 * @returns The form's initial values.
 */
export function initialForm(initial?: McpServerView): McpEditorForm {
  return {
    serverName: initial?.serverName ?? '',
    label: initial?.label ?? '',
    transport: initial?.transport ?? 'stdio',
    command: initial?.command ?? '',
    args: initial?.args.join('\n') ?? '',
    cwd: initial?.cwd ?? '',
    url: initial?.url ?? '',
    envAdd: '',
    headersAdd: '',
    envRemove: [],
    headersRemove: [],
    timeout: String(initial?.toolCallTimeoutMs ?? DEFAULT_TIMEOUT_MS),
  }
}

/**
 * Parse `NAME=value` lines. A line without `=` is ignored rather than guessed
 * at, so a stray line never becomes a variable with an empty value.
 * @param text - Textarea contents.
 * @returns The assignments the text declares.
 */
export function parseAssignments(text: string): Record<string, string> {
  const assignments: Record<string, string> = {}
  for (const line of text.split('\n')) {
    const separator = line.indexOf('=')
    if (separator < 1) continue
    assignments[line.slice(0, separator).trim()] = line.slice(separator + 1).trim()
  }
  return assignments
}

/**
 * Parse one value per line, dropping blank lines.
 * @param text - Textarea contents.
 * @returns The non-empty trimmed lines.
 */
export function parseLines(text: string): string[] {
  return text
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0)
}

/**
 * Read the timeout field.
 * @param text - The raw field value.
 * @returns The positive millisecond value, or undefined when unusable.
 */
export function parseTimeout(text: string): number | undefined {
  const value = Number(text.trim())
  if (text.trim().length === 0 || !Number.isFinite(value) || value <= 0) return undefined
  return value
}

/**
 * Build the new-server draft the form describes.
 * @param form - Current form values.
 * @param timeout - The already-validated timeout.
 * @returns The draft the Host normalizes.
 */
export function buildDraft(form: McpEditorForm, timeout: number): McpServerDraft {
  const common = {
    serverName: form.serverName.trim(),
    label: form.label,
    transport: form.transport,
    toolCallTimeoutMs: timeout,
    env: parseAssignments(form.envAdd),
    headers: parseAssignments(form.headersAdd),
  }
  return form.transport === 'stdio'
    ? { ...common, command: form.command.trim(), args: parseLines(form.args), cwd: form.cwd.trim() }
    : { ...common, url: form.url.trim() }
}

/**
 * Build the edit patch, including the variable-level secret operations.
 * @param form - Current form values.
 * @param timeout - The already-validated timeout.
 * @returns The patch the Host applies.
 */
export function buildPatch(form: McpEditorForm, timeout: number): McpServerPatch {
  const patch: McpServerPatch = {
    label: form.label,
    transport: form.transport,
    toolCallTimeoutMs: timeout,
    env: secretPatch(form.envRemove, parseAssignments(form.envAdd)),
    headers: secretPatch(form.headersRemove, parseAssignments(form.headersAdd)),
  }
  if (form.transport === 'stdio') {
    patch.command = form.command.trim()
    patch.args = parseLines(form.args)
    patch.cwd = form.cwd.trim()
  } else {
    patch.url = form.url.trim()
  }
  return patch
}

/**
 * Keep the editor open so a refused write's draft survives for correction.
 */
function keepDraft(): void {}

/**
 * Turn removals and additions into the variable-level patch.
 * @param remove - Stored names the user marked for removal.
 * @param add - Names the user typed.
 * @returns Set and remove operations; unmentioned names stay untouched.
 */
function secretPatch(remove: readonly string[], add: Record<string, string>): Record<string, string | null> {
  const patch: Record<string, string | null> = {}
  for (const name of remove) patch[name] = null
  for (const [name, value] of Object.entries(add)) patch[name] = value
  return patch
}

/**
 * Render the add/edit form.
 * @param props - Form mode, seed values, and callbacks.
 * @returns The editor form.
 */
export function ServerEditor(props: ServerEditorProps): ReactNode {
  const { mode, initial, writeError, testState, t, onSaveAdd, onSaveEdit, onTest, onClose } = props
  const [form, setForm] = useState<McpEditorForm>(() => initialForm(initial))
  const timeout = parseTimeout(form.timeout)
  const submittable = timeout !== undefined && form.serverName.trim().length > 0

  /** Replace one form field. */
  const set = <K extends keyof McpEditorForm>(key: K, value: McpEditorForm[K]): void => {
    setForm(previous => ({ ...previous, [key]: value }))
  }

  /** Toggle one stored secret name for removal. */
  const toggleRemoval = (key: 'envRemove' | 'headersRemove', name: string): void => {
    setForm(previous => ({
      ...previous,
      [key]: previous[key].includes(name)
        ? previous[key].filter(entry => entry !== name)
        : [...previous[key], name],
    }))
  }

  /** Save the form, closing it when the write landed. */
  const submit = async (event: FormEvent): Promise<void> => {
    event.preventDefault()
    /* v8 ignore next -- a form submit is unreachable while the save control is disabled for this same reason */
    if (timeout === undefined) return
    const saved = mode === 'edit' && initial !== undefined
      ? await onSaveEdit(initial.id, buildPatch(form, timeout))
      : await onSaveAdd(buildDraft(form, timeout))
    // A refused write stays on screen with its draft; a landed one closes.
    const settle = saved ? onClose : keepDraft
    settle()
  }

  /** Test the form's current contents, seeded from the entry when editing. */
  const test = (): void => {
    /* v8 ignore next -- the test control is disabled while the timeout is unusable */
    if (timeout === undefined) return
    const draft = buildDraft(form, timeout)
    onTest(initial === undefined ? { draft } : { draft, basedOn: initial.id })
  }

  /** One stored-secret removal list. */
  const secrets = (key: 'envRemove' | 'headersRemove', names: readonly string[]): ReactNode => (
    names.length === 0
      ? <span className={css.secretNone}>{t('secret.none')}</span>
      : (
        <span className={css.secretList}>
          {names.map(name => (
            <label key={name} className={css.secretItem}>
              <input
                type="checkbox"
                checked={form[key].includes(name)}
                onChange={() => { toggleRemoval(key, name) }}
              />
              {name}
            </label>
          ))}
        </span>
      )
  )

  return (
    <form className={css.editor} onSubmit={(event) => { void submit(event) }}>
      <label className={css.field}>
        <span>{t('field.serverName')}</span>
        <Input
          value={form.serverName}
          disabled={mode === 'edit'}
          aria-label={t('field.serverName')}
          onChange={(event) => { set('serverName', event.target.value) }}
        />
      </label>
      <p className={css.hint}>
        {mode === 'edit' ? t('field.serverName.fixed') : t('field.serverName.hint')}
      </p>

      <label className={css.field}>
        <span>{t('field.label')}</span>
        <Input
          value={form.label}
          aria-label={t('field.label')}
          onChange={(event) => { set('label', event.target.value) }}
        />
      </label>

      <label className={css.field}>
        <span>{t('field.transport')}</span>
        <select
          className={css.select}
          value={form.transport}
          aria-label={t('field.transport')}
          onChange={(event) => { set('transport', event.target.value === 'stdio' ? 'stdio' : 'streamable-http') }}
        >
          <option value="stdio">{t('transport.stdio')}</option>
          <option value="streamable-http">{t('transport.http')}</option>
        </select>
      </label>

      {form.transport === 'stdio'
        ? (
          <>
            <label className={css.field}>
              <span>{t('field.command')}</span>
              <Input
                value={form.command}
                aria-label={t('field.command')}
                onChange={(event) => { set('command', event.target.value) }}
              />
            </label>
            <label className={css.field}>
              <span>{t('field.args')}</span>
              <textarea
                className={css.textarea}
                value={form.args}
                aria-label={t('field.args')}
                onChange={(event) => { set('args', event.target.value) }}
              />
            </label>
            <label className={css.field}>
              <span>{t('field.cwd')}</span>
              <Input
                value={form.cwd}
                aria-label={t('field.cwd')}
                onChange={(event) => { set('cwd', event.target.value) }}
              />
            </label>
            <div className={css.secretRow}>
              <span>{t('field.env')}</span>
              {secrets('envRemove', initial?.envKeys ?? [])}
            </div>
            <label className={css.field}>
              <span>{t('secret.add')}</span>
              <textarea
                className={css.textarea}
                value={form.envAdd}
                aria-label={t('secret.add')}
                onChange={(event) => { set('envAdd', event.target.value) }}
              />
            </label>
          </>
        )
        : (
          <>
            <label className={css.field}>
              <span>{t('field.url')}</span>
              <Input
                value={form.url}
                aria-label={t('field.url')}
                onChange={(event) => { set('url', event.target.value) }}
              />
            </label>
            <div className={css.secretRow}>
              <span>{t('field.headers')}</span>
              {secrets('headersRemove', initial?.headerKeys ?? [])}
            </div>
            <label className={css.field}>
              <span>{t('secret.add')}</span>
              <textarea
                className={css.textarea}
                value={form.headersAdd}
                aria-label={t('secret.add')}
                onChange={(event) => { set('headersAdd', event.target.value) }}
              />
            </label>
          </>
        )}

      <label className={css.field}>
        <span>{t('field.timeout')}</span>
        <Input
          value={form.timeout}
          inputMode="numeric"
          aria-label={t('field.timeout')}
          onChange={(event) => { set('timeout', event.target.value) }}
        />
      </label>

      {writeError.length > 0 && <p className={css.failure} role="alert">{writeError}</p>}

      <div className={css.actions}>
        <Button variant="primary" type="submit" disabled={!submittable}>{t('action.save')}</Button>
        <Button onClick={test} disabled={timeout === undefined}>{t('test.action')}</Button>
        <Button onClick={onClose}>{t('action.cancel')}</Button>
      </div>
      <TestOutcome state={testState} t={t} />
    </form>
  )
}
