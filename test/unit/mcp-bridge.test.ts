import test from 'node:test'
import assert from 'node:assert/strict'
import bridgeDefault, {
  MCP_SERVERS_ENV,
  registerEnvMcpServers,
  type PiLike,
  type PiMcpServerConfig
} from '../../src/pi-extension/mcp-bridge.js'

class FakePi implements PiLike {
  readonly registered: Array<{ name: string; config: PiMcpServerConfig }> = []
  failOn: string | null = null

  registerMcpServer(name: string, config: PiMcpServerConfig): void {
    if (this.failOn === name) throw new Error(`boom: ${name}`)
    this.registered.push({ name, config })
  }
}

function envOf(servers: unknown[]): NodeJS.ProcessEnv {
  return envOfRaw(JSON.stringify(servers))
}

function envOfRaw(value: string): NodeJS.ProcessEnv {
  return { [MCP_SERVERS_ENV]: value }
}

test('mcp-bridge: default export is a registration function', () => {
  assert.equal(typeof bridgeDefault, 'function')
})

test('mcp-bridge: no env var means no registrations and no errors', () => {
  const pi = new FakePi()
  registerEnvMcpServers(pi, {})
  assert.deepEqual(pi.registered, [])
})

test('mcp-bridge: registers http and stdio entries from the env payload', () => {
  const pi = new FakePi()
  registerEnvMcpServers(
    pi,
    envOf([
      { name: 'kandev', url: 'http://localhost:43107/mcp', headers: { Authorization: 'Bearer tok' } },
      { name: 'tools', command: 'npx', args: ['-y', 'tools-mcp'], env: { K: 'V' } }
    ])
  )

  assert.deepEqual(pi.registered, [
    { name: 'kandev', config: { url: 'http://localhost:43107/mcp', headers: { Authorization: 'Bearer tok' } } },
    { name: 'tools', config: { command: 'npx', args: ['-y', 'tools-mcp'], env: { K: 'V' } } }
  ])
})

test('mcp-bridge: drops unknown entry fields when building the config', () => {
  const pi = new FakePi()
  registerEnvMcpServers(pi, envOf([{ name: 'x', url: 'https://x.test/mcp', junk: 'drop-me' }]))

  assert.deepEqual(pi.registered, [{ name: 'x', config: { url: 'https://x.test/mcp' } }])
})

test('mcp-bridge: invalid JSON registers nothing and does not throw', () => {
  const pi = new FakePi()
  registerEnvMcpServers(pi, envOfRaw('{not-json'))
  assert.deepEqual(pi.registered, [])
})

test('mcp-bridge: non-array payload registers nothing and does not throw', () => {
  const pi = new FakePi()
  registerEnvMcpServers(pi, envOfRaw(JSON.stringify({ name: 'x' })))
  assert.deepEqual(pi.registered, [])
})

test('mcp-bridge: empty array is a no-op', () => {
  const pi = new FakePi()
  registerEnvMcpServers(pi, envOfRaw('[]'))
  assert.deepEqual(pi.registered, [])
})

test('mcp-bridge: pi without registerMcpServer registers nothing and does not throw', () => {
  const pi: PiLike = {}
  registerEnvMcpServers(pi, envOf([{ name: 'x', url: 'https://x.test/mcp' }]))
})

test('mcp-bridge: one failing registration does not block the rest', () => {
  const pi = new FakePi()
  pi.failOn = 'bad'
  registerEnvMcpServers(
    pi,
    envOf([
      { name: 'good-1', url: 'https://one.test/mcp' },
      { name: 'bad', url: 'https://bad.test/mcp' },
      { name: 'good-2', url: 'https://two.test/mcp' }
    ])
  )

  assert.deepEqual(
    pi.registered.map(r => r.name),
    ['good-1', 'good-2']
  )
})

test('mcp-bridge: entry without a name is skipped, siblings still register', () => {
  const pi = new FakePi()
  registerEnvMcpServers(pi, envOf([{ url: 'https://anon.test/mcp' }, { name: 'named', url: 'https://n.test/mcp' }]))

  assert.deepEqual(
    pi.registered.map(r => r.name),
    ['named']
  )
})
