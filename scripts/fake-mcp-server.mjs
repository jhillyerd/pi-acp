// Minimal stdio MCP server used by scripts/smoke-acp-mcp.mjs.
// Speaks just enough MCP for pi's client to connect and list tools, and
// writes a marker file once the MCP initialize request arrives.
import { writeFileSync } from 'node:fs'

const marker = process.argv[2]
if (!marker) {
  console.error('usage: node fake-mcp-server.mjs <marker-file>')
  process.exit(1)
}

let buffer = ''

function send(msg) {
  process.stdout.write(JSON.stringify(msg) + '\n')
}

process.stdin.setEncoding('utf8')
process.stdin.on('data', chunk => {
  buffer += chunk
  const lines = buffer.split('\n')
  buffer = lines.pop() ?? ''
  for (const line of lines) {
    if (!line.trim()) continue
    let msg
    try {
      msg = JSON.parse(line)
    } catch {
      continue
    }
    if (msg?.method === 'initialize') {
      writeFileSync(marker, 'connected\n')
      send({
        jsonrpc: '2.0',
        id: msg.id,
        result: {
          protocolVersion: msg.params?.protocolVersion ?? '2025-06-18',
          capabilities: { tools: {} },
          serverInfo: { name: 'smoke-mcp', version: '0.0.0' }
        }
      })
    } else if (msg?.method === 'tools/list') {
      send({
        jsonrpc: '2.0',
        id: msg.id,
        result: {
          tools: [
            {
              name: 'smoke_ping',
              description: 'Smoke test tool',
              inputSchema: { type: 'object', properties: {} }
            }
          ]
        }
      })
    } else if (msg?.id !== undefined) {
      send({ jsonrpc: '2.0', id: msg.id, result: {} })
    }
  }
})
