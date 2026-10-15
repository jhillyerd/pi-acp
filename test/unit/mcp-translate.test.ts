import test from 'node:test'
import assert from 'node:assert/strict'
import { translateAcpMcpServers, toMcpSpawnEntries } from '../../src/acp/mcp/translate.js'

test('translateAcpMcpServers: returns empty for null, undefined, and empty input', () => {
  assert.deepEqual(translateAcpMcpServers(null), { entries: [], skipped: [] })
  assert.deepEqual(translateAcpMcpServers(undefined), { entries: [], skipped: [] })
  assert.deepEqual(translateAcpMcpServers([]), { entries: [], skipped: [] })
})

test('translateAcpMcpServers: translates stdio servers to command/args/env', () => {
  const { entries, skipped } = translateAcpMcpServers([
    {
      name: 'tools',
      command: 'npx',
      args: ['-y', 'tools-mcp'],
      env: [
        { name: 'API_KEY', value: 'secret' },
        { name: 'EMPTY', value: '' }
      ]
    } as any
  ])

  assert.deepEqual(skipped, [])
  assert.deepEqual(entries, [
    {
      name: 'tools',
      command: 'npx',
      args: ['-y', 'tools-mcp'],
      env: { API_KEY: 'secret', EMPTY: '' }
    }
  ])
})

test('translateAcpMcpServers: translates http servers to url/headers', () => {
  const { entries, skipped } = translateAcpMcpServers([
    {
      type: 'http',
      name: 'kandev',
      url: 'http://localhost:43107/mcp',
      headers: [{ name: 'Authorization', value: 'Bearer tok' }]
    } as any
  ])

  assert.deepEqual(skipped, [])
  assert.deepEqual(entries, [
    {
      name: 'kandev',
      url: 'http://localhost:43107/mcp',
      headers: { Authorization: 'Bearer tok' }
    }
  ])
})

test('translateAcpMcpServers: http entry without headers omits the headers key', () => {
  const { entries } = translateAcpMcpServers([
    { type: 'http', name: 'bare', url: 'https://example.test/mcp', headers: [] } as any
  ])

  assert.deepEqual(entries, [{ name: 'bare', url: 'https://example.test/mcp' }])
})

test('translateAcpMcpServers: skips sse servers with a reason', () => {
  const { entries, skipped } = translateAcpMcpServers([
    { type: 'sse', name: 'legacy', url: 'http://localhost:1/sse', headers: [] } as any
  ])

  assert.deepEqual(entries, [])
  assert.equal(skipped.length, 1)
  assert.equal(skipped[0]!.name, 'legacy')
  assert.match(skipped[0]!.reason, /SSE/)
})

test('translateAcpMcpServers: skips acp-transport servers with a reason', () => {
  const { entries, skipped } = translateAcpMcpServers([{ type: 'acp', name: 'bridged', id: 'x' } as any])

  assert.deepEqual(entries, [])
  assert.equal(skipped.length, 1)
  assert.equal(skipped[0]!.name, 'bridged')
  assert.match(skipped[0]!.reason, /MCP-over-ACP/)
})

test('translateAcpMcpServers: skips malformed entries instead of failing the batch', () => {
  const { entries, skipped } = translateAcpMcpServers([
    { type: 'http', name: 'no-url', headers: [] } as any,
    { name: 'no-command', args: [], env: [] } as any
  ])

  assert.deepEqual(entries, [])
  assert.deepEqual(
    skipped.map(s => s.name),
    ['no-url', 'no-command']
  )
})

test('translateAcpMcpServers: mixes supported and skipped servers', () => {
  const { entries, skipped } = translateAcpMcpServers([
    { type: 'http', name: 'a', url: 'https://a.test/mcp', headers: [] } as any,
    { type: 'sse', name: 'b', url: 'https://b.test/sse', headers: [] } as any,
    { name: 'c', command: 'run-c', args: [], env: [] } as any
  ])

  assert.deepEqual(
    entries.map(e => e.name),
    ['a', 'c']
  )
  assert.deepEqual(
    skipped.map(s => s.name),
    ['b']
  )
})

test('toMcpSpawnEntries: reports skipped servers through the warn sink', () => {
  const warnings: string[] = []
  const entries = toMcpSpawnEntries(
    [
      { type: 'sse', name: 'legacy', url: 'https://b.test/sse', headers: [] } as any,
      { type: 'http', name: 'a', url: 'https://a.test/mcp', headers: [] } as any
    ],
    message => warnings.push(message)
  )

  assert.deepEqual(
    entries.map(e => e.name),
    ['a']
  )
  assert.equal(warnings.length, 1)
  assert.match(warnings[0]!, /"legacy"/)
})
