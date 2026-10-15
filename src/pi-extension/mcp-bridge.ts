/**
 * pi extension bundled with pi-acp.
 *
 * Loaded only for adapter-spawned pi processes (`pi --extension <this file>`)
 * when the ACP client provided MCP servers. Reads PI_ACP_MCP_SERVERS (a JSON
 * array of pi mcp.json-style entries, see ../acp/mcp/translate.ts) and
 * registers each server with pi's built-in MCP support via
 * `pi.registerMcpServer()`.
 *
 * This file runs inside the *user's* pi process, whose version is independent
 * of this package, so it must not import from a pinned pi package: the types
 * below are structural, and a pi without `registerMcpServer` degrades to a
 * logged error instead of a crash.
 */
export const MCP_SERVERS_ENV = 'PI_ACP_MCP_SERVERS'

export type PiMcpServerConfig = {
  command?: string
  args?: string[]
  env?: Record<string, string>
  cwd?: string
  url?: string
  headers?: Record<string, string>
}

export type PiLike = {
  registerMcpServer?: (name: string, config: PiMcpServerConfig) => void
}

export type PiMcpEntry = { name: string } & PiMcpServerConfig

function fail(message: string): void {
  console.error(`pi-acp mcp-bridge: ${message}`)
}

function toConfig(server: PiMcpEntry): PiMcpServerConfig {
  const config: PiMcpServerConfig = {}
  for (const key of ['command', 'args', 'env', 'cwd', 'url', 'headers'] as const) {
    const value = server[key]
    if (value !== undefined) (config as Record<string, unknown>)[key] = value
  }
  return config
}

/**
 * Register every entry from `env[PI_ACP_MCP_SERVERS]` on `pi`. Never throws:
 * a malformed payload or an unsupported pi version is reported and the
 * remaining servers still register.
 */
export function registerEnvMcpServers(pi: PiLike, env: NodeJS.ProcessEnv = process.env): void {
  const raw = env[MCP_SERVERS_ENV]
  if (!raw) return

  let servers: unknown
  try {
    servers = JSON.parse(raw)
  } catch {
    fail(`${MCP_SERVERS_ENV} is not valid JSON; no MCP servers were registered`)
    return
  }
  if (!Array.isArray(servers)) {
    fail(`${MCP_SERVERS_ENV} is not a JSON array; no MCP servers were registered`)
    return
  }
  if (servers.length === 0) return

  if (typeof pi.registerMcpServer !== 'function') {
    fail(
      'this pi version has no registerMcpServer API (pi with built-in MCP, 1.x+, is required); no MCP servers were registered'
    )
    return
  }

  for (const server of servers) {
    const entry = server as PiMcpEntry | null | undefined
    if (!entry || typeof entry.name !== 'string' || entry.name.length === 0) {
      fail('skipping MCP server entry without a name')
      continue
    }
    try {
      pi.registerMcpServer(entry.name, toConfig(entry))
    } catch (error) {
      fail(`could not register "${entry.name}": ${error instanceof Error ? error.message : String(error)}`)
    }
  }
}

export default function (pi: PiLike): void {
  registerEnvMcpServers(pi)
}
