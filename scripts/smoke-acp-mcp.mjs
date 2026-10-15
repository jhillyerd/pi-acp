// End-to-end smoke for the ACP -> pi MCP wiring.
//
// Spawns the built adapter, opens an ACP session with one stdio MCP server
// (scripts/fake-mcp-server.mjs), and asserts pi actually connects to it:
// the fake server writes a marker file when pi's MCP client initializes it.
// This exercises the full chain: session/new mcpServers -> spawn env +
// --extension -> bundled mcp-bridge -> pi.registerMcpServer -> MCP connect.
//
// Requires `pi` on PATH. No model or API key: the session is never prompted.
import { spawn } from 'node:child_process'
import { existsSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const cwd = process.cwd()

await new Promise((resolve, reject) => {
  const p = spawn('npm', ['run', 'build'], { stdio: 'inherit', cwd })
  p.on('exit', code => (code === 0 ? resolve() : reject(new Error(`build failed: ${code}`))))
})

const marker = join(tmpdir(), `pi-acp-mcp-smoke-${process.pid}.marker`)
rmSync(marker, { force: true })

const child = spawn('node', ['dist/index.js'], {
  cwd,
  stdio: ['pipe', 'pipe', 'inherit'],
  env: process.env
})

function send(obj) {
  child.stdin.write(JSON.stringify(obj) + '\n')
}

send({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: 1 } })
send({
  jsonrpc: '2.0',
  id: 2,
  method: 'session/new',
  params: {
    cwd,
    mcpServers: [
      {
        name: 'smoke-mcp',
        command: process.execPath,
        args: [join(cwd, 'scripts/fake-mcp-server.mjs'), marker],
        env: []
      }
    ]
  }
})

const deadline = Date.now() + 20_000
const poll = setInterval(() => {
  if (existsSync(marker)) {
    clearInterval(poll)
    console.log('\nsmoke: OK - pi connected to the ACP-provided MCP server')
    child.kill('SIGTERM')
    process.exit(0)
  }
  if (Date.now() > deadline) {
    clearInterval(poll)
    console.error('\nsmoke: FAILED - MCP server was never connected (marker missing)')
    child.kill('SIGTERM')
    process.exit(1)
  }
  if (child.exitCode !== null) {
    clearInterval(poll)
    console.error(`\nsmoke: FAILED - adapter exited early (code ${child.exitCode})`)
    process.exit(1)
  }
}, 200)
