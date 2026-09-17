// Web e2e scenario: the MCP settings section — the empty roster, the add form,
// one server written through the real wire down to `$DSH_HOME/settings.yaml`,
// a connectivity test that must fail loudly, and the removal confirmation.
// Zero model calls: every step is settings-document traffic plus a spawn of a
// deliberately absent executable, so there is no session fixture and a stray
// stream would fail loud on the open llm seam.
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import type { Browser, Page } from 'playwright'
import { chromium } from 'playwright'
import { afterAll, beforeAll, describe, expect, it, onTestFailed } from 'vitest'
import {
  assertFixtureInventory, captureStableAria, compareOrRefreshGolden,
  launchWebScaffold, watchConsole, webSnapshotMode, type WebScaffold,
} from './scaffold.ts'
import { ZH_BROWSER_LOCALE, saveFailureShot } from './support.ts'

const SNAPSHOT_DIR = fileURLToPath(new URL('./expected/mcp-settings', import.meta.url))
const EMPTY_EXPECTED = join(SNAPSHOT_DIR, 'empty.expected.md')
const EDITOR_EXPECTED = join(SNAPSHOT_DIR, 'editor.expected.md')
const MODE = webSnapshotMode()

/** The namespace this scenario adds, writes, tests, and removes. */
const SERVER_NAME = 'e2e-mcp'
/** An executable that cannot exist, so the connectivity test fails deterministically. */
const ABSENT_COMMAND = '/nonexistent/dsh-e2e-mcp-server'

describe('web e2e: MCP settings section', () => {
  let scaffold: WebScaffold
  let browser: Browser
  let page: Page
  let tripwire: ReturnType<typeof watchConsole>

  beforeAll(async () => {
    scaffold = await launchWebScaffold({})
    browser = await chromium.launch()
    // Chinese browser: the section asserts the localized copy the client
    // derives from it, as the rest of the settings surface does.
    page = await browser.newPage({ viewport: { width: 1680, height: 1000 }, locale: ZH_BROWSER_LOCALE })
    tripwire = watchConsole(page)
    await page.goto(scaffold.authenticatedUrl, { waitUntil: 'load' })
    await page.waitForSelector('[class*="frame"]', { timeout: 30_000 })
  }, 120_000)

  afterAll(async () => {
    await browser?.close()
    await scaffold?.close()
  })

  /** Open the settings dialog on the MCP section. */
  async function openMcp() {
    if (await page.getByRole('dialog', { name: '设置' }).count() > 0) {
      await page.keyboard.press('Escape')
      await expect.poll(() => page.getByRole('dialog', { name: '设置' }).count(), { timeout: 5_000 }).toBe(0)
    }
    await page.getByRole('button', { name: '设置', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: '设置' })
    await dialog.waitFor({ timeout: 10_000 })
    await dialog.getByRole('button', { name: 'MCP', exact: true }).click()
    await expect
      .poll(() => dialog.getByRole('button', { name: 'MCP', exact: true }).getAttribute('aria-current'), { timeout: 5_000 })
      .toBe('true')
    return dialog
  }

  /** The settings document as the Host has written it so far. */
  async function settingsDocument(): Promise<string> {
    return readFile(join(scaffold.harnessHome, 'settings.yaml'), 'utf8').catch(() => '')
  }

  /** The roster row this scenario owns. */
  function row(dialog: ReturnType<Page['getByRole']>) {
    return dialog.locator('li').filter({ hasText: SERVER_NAME })
  }

  it('starts with an empty roster', async () => {
    onTestFailed(() => saveFailureShot(page, 'web-e2e-mcp-settings-empty'))
    const dialog = await openMcp()

    await dialog.getByText('尚未配置 MCP 服务器').waitFor({ timeout: 10_000 })

    const snapshot = await captureStableAria(page, '[role="dialog"]', scaffold.workspaceCwd)
    await compareOrRefreshGolden(EMPTY_EXPECTED, snapshot, MODE)
    expect(tripwire.pageErrors).toEqual([])
  }, 60_000)

  it('opens the add form and writes the server through the real wire', async () => {
    onTestFailed(() => saveFailureShot(page, 'web-e2e-mcp-settings-editor'))
    const dialog = await openMcp()

    await dialog.getByRole('button', { name: '添加服务器' }).click()
    const form = page.locator('form')
    await form.waitFor({ timeout: 10_000 })

    const snapshot = await captureStableAria(page, '[role="dialog"]', scaffold.workspaceCwd)
    await compareOrRefreshGolden(EDITOR_EXPECTED, snapshot, MODE)

    await form.getByRole('textbox', { name: '命名空间' }).fill(SERVER_NAME)
    await form.getByRole('textbox', { name: '命令' }).fill(ABSENT_COMMAND)
    await form.getByRole('button', { name: '保存' }).click()

    await row(dialog).waitFor({ timeout: 10_000 })
    await expect.poll(async () => (await settingsDocument()).includes(SERVER_NAME), { timeout: 10_000 }).toBe(true)
    expect(await settingsDocument()).toContain('transport: stdio')
    expect(tripwire.pageErrors).toEqual([])
  }, 60_000)

  it('reports the unreachable server as a failed test, never as working', async () => {
    onTestFailed(() => saveFailureShot(page, 'web-e2e-mcp-settings-test'))
    const dialog = await openMcp()
    const target = row(dialog)

    await target.getByRole('button', { name: '测试' }).click()

    await expect.poll(async () => (await target.textContent())?.includes('失败') ?? false, { timeout: 60_000 }).toBe(true)
    expect(tripwire.pageErrors).toEqual([])
  }, 90_000)

  it('removes the server only after the confirmation', async () => {
    onTestFailed(() => saveFailureShot(page, 'web-e2e-mcp-settings-remove'))
    const dialog = await openMcp()
    const target = row(dialog)

    await target.getByRole('button', { name: '移除' }).click()
    await dialog.getByText('移除这台服务器？它的工具会立即从模型中消失。').waitFor({ timeout: 5_000 })
    // Nothing is written until the confirmation's own button is pressed.
    expect(await settingsDocument()).toContain(SERVER_NAME)

    await target.getByRole('button', { name: '移除' }).last().click()

    await expect.poll(async () => (await settingsDocument()).includes(SERVER_NAME), { timeout: 10_000 }).toBe(false)
    await expect.poll(() => row(dialog).count(), { timeout: 10_000 }).toBe(0)
    expect(tripwire.pageErrors).toEqual([])
  }, 60_000)

  it.skipIf(MODE === 'record')('keeps the fixture inventory closed', async () => {
    expect(tripwire.warnings).toEqual([])
    await assertFixtureInventory(SNAPSHOT_DIR, ['editor.expected.md', 'empty.expected.md'])
  })
})
