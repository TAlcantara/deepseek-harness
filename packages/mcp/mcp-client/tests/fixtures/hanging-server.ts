/**
 * MCP server that accepts stdio input and never answers, for probe timeout and
 * cancellation tests.
 *
 * Optional argv: `<pidFile> <exitMarkerFile>`. The pid file records the child
 * process id at startup; the exit marker is written from an exit handler so a
 * test can prove the probe terminated the child rather than abandoning it.
 *
 * Run: node hanging-server.ts [pidFile] [exitMarkerFile]
 */

import { writeFileSync } from 'node:fs'

const pidFile = process.argv[2]
const exitMarkerFile = process.argv[3]

if (pidFile !== undefined) writeFileSync(pidFile, String(process.pid))
if (exitMarkerFile !== undefined) {
  process.on('exit', () => { writeFileSync(exitMarkerFile, 'closed') })
}

// Answer the SDK's SIGTERM shutdown instead of dying inside the default
// handler, so the exit marker is written before the process goes away.
process.on('SIGTERM', () => { process.exit(0) })

// Reading stdin and holding one long timer keep the process alive: every
// request a client sends is read and discarded, so the client must time out.
process.stdin.resume()
setInterval(() => { /* keep the event loop alive without answering */ }, 1 << 30)
