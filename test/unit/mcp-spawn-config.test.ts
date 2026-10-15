import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { buildMcpExtensionArgs, buildMcpServersEnv, resolveMcpBridgePath } from '../../src/pi-rpc/process.js'
import { MCP_SERVERS_ENV, type PiMcpEntry } from '../../src/pi-extension/mcp-bridge.js'

const entries: PiMcpEntry[] = [{ name: 'kandev', url: 'http://localhost:43107/mcp' }]

test('buildMcpExtensionArgs: no servers means no args', () => {
  assert.deepEqual(buildMcpExtensionArgs([], '/bridge.js'), [])
  assert.deepEqual(buildMcpExtensionArgs(undefined, '/bridge.js'), [])
})

test('buildMcpExtensionArgs: servers plus a bridge path yields --extension', () => {
  assert.deepEqual(buildMcpExtensionArgs(entries, '/dist/mcp-bridge.js'), ['--extension', '/dist/mcp-bridge.js'])
})

test('buildMcpExtensionArgs: missing bridge path reports through warn and yields no args', () => {
  const warnings: string[] = []
  assert.deepEqual(
    buildMcpExtensionArgs(entries, null, m => warnings.push(m)),
    []
  )
  assert.equal(warnings.length, 1)
  assert.match(warnings[0]!, /mcp-bridge/)
})

test('buildMcpServersEnv: no servers leaves the env untouched (null)', () => {
  assert.equal(buildMcpServersEnv([]), null)
  assert.equal(buildMcpServersEnv(undefined), null)
})

test('buildMcpServersEnv: serializes entries into the env var over a base env', () => {
  const env = buildMcpServersEnv(entries, { PATH: '/bin' } as NodeJS.ProcessEnv)
  assert.ok(env)
  assert.equal(env!.PATH, '/bin')
  assert.deepEqual(JSON.parse(env![MCP_SERVERS_ENV]!), entries)
})

test('resolveMcpBridgePath: finds the source-tree bridge next to src/pi-rpc', () => {
  const moduleUrl = pathToFileURL(join(process.cwd(), 'src/pi-rpc/process.ts'))
  const resolved = resolveMcpBridgePath(moduleUrl)
  assert.ok(resolved, 'expected the src/pi-extension/mcp-bridge.ts candidate to resolve')
  assert.match(resolved!, /pi-extension[\\/]mcp-bridge\.ts$/)
})

test('resolveMcpBridgePath: finds a sibling mcp-bridge.js first when present', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pi-acp-bridge-'))
  const bridge = join(dir, 'mcp-bridge.js')
  writeFileSync(bridge, '// stub\n')
  const resolved = resolveMcpBridgePath(pathToFileURL(join(dir, 'index.js')))
  assert.equal(resolved, bridge)
})

test('resolveMcpBridgePath: returns null when no candidate exists', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pi-acp-nobridge-'))
  assert.equal(resolveMcpBridgePath(pathToFileURL(join(dir, 'index.js'))), null)
})
