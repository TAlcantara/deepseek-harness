/**
 * MCP server that serves one tool only when the probe token matches, and
 * records every start in a log file.
 *
 * The token gate proves a connectivity test used a stored secret value rather
 * than the draft's own empty environment; the start log proves whether a
 * reconciliation remounted an instance.
 *
 * Environment: `ROSTER_PROBE_TOKEN` must equal `expected-token`;
 * `ROSTER_START_LOG` names a file appended per process start.
 *
 * Run: node env-gated-server.ts
 */

import { appendFileSync } from 'node:fs'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'

const startLog = process.env.ROSTER_START_LOG
if (startLog !== undefined) appendFileSync(startLog, `${String(process.pid)}\n`)

if (process.env.ROSTER_PROBE_TOKEN !== 'expected-token') process.exit(3)

const server = new McpServer({ name: 'env-gated', version: '1.0.0' }, { capabilities: { tools: {} } })

server.registerTool('gated', {
  description: 'Available only when the probe token matched.',
  inputSchema: {},
}, async () => ({ content: [{ type: 'text', text: 'gated ok' }] }))

await server.connect(new StdioServerTransport())
