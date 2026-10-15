import type { McpServer, McpServerHttp, McpServerStdio } from '@agentclientprotocol/sdk'

/**
 * MCP server entry handed to the bundled pi extension through
 * PI_ACP_MCP_SERVERS. The shape matches an `mcpServers` entry in pi's
 * mcp.json: stdio servers use command/args/env, streamable HTTP servers
 * use url/headers.
 */
export type PiMcpEntry = {
  name: string
  url?: string
  headers?: Record<string, string>
  command?: string
  args?: string[]
  env?: Record<string, string>
  cwd?: string
}

export type SkippedMcpServer = { name: string; reason: string }

export type McpTranslation = { entries: PiMcpEntry[]; skipped: SkippedMcpServer[] }

function recordFromPairs(
  pairs: ReadonlyArray<{ name: string; value: string }> | undefined | null
): Record<string, string> | undefined {
  if (!pairs || pairs.length === 0) return undefined
  const record: Record<string, string> = {}
  for (const pair of pairs) {
    if (pair && typeof pair.name === 'string' && typeof pair.value === 'string') {
      record[pair.name] = pair.value
    }
  }
  return record
}

/**
 * Translate ACP `session/new` MCP servers into pi-native MCP config entries.
 *
 * Supported transports:
 * - stdio (no `type`) -> command/args/env
 * - http (streamable) -> url/headers
 *
 * Skipped transports (returned with reasons instead of failing):
 * - sse: pi rejects the legacy SSE transport; clients should point at the
 *   streamable HTTP endpoint instead.
 * - acp: MCP-over-ACP is an unstable ACP extension this adapter does not bridge.
 */
export function translateAcpMcpServers(
  servers: ReadonlyArray<McpServer> | undefined | null
): McpTranslation {
  const entries: PiMcpEntry[] = []
  const skipped: SkippedMcpServer[] = []
  if (!servers || servers.length === 0) return { entries, skipped }

  for (const server of servers) {
    const name = typeof server?.name === 'string' && server.name.length > 0 ? server.name : '(unnamed)'
    // McpServerStdio carries no `type` discriminant, so read it structurally
    // and cast per branch (the SDK union does not narrow through a switch).
    switch ((server as { type?: string }).type) {
      case 'http': {
        const http = server as McpServerHttp
        if (typeof http.url !== 'string' || http.url.length === 0) {
          skipped.push({ name, reason: 'http server has no url' })
          break
        }
        const entry: PiMcpEntry = { name, url: http.url }
        const headers = recordFromPairs(http.headers)
        if (headers) entry.headers = headers
        entries.push(entry)
        break
      }
      case 'sse':
        skipped.push({
          name,
          reason: 'pi does not support the legacy SSE transport; use the streamable HTTP endpoint'
        })
        break
      case 'acp':
        skipped.push({ name, reason: 'MCP-over-ACP transport is not supported' })
        break
      default: {
        const stdio = server as McpServerStdio
        if (typeof stdio.command !== 'string' || stdio.command.length === 0) {
          skipped.push({ name, reason: 'stdio server has no command' })
          break
        }
        const entry: PiMcpEntry = {
          name,
          command: stdio.command,
          args: Array.isArray(stdio.args) ? [...stdio.args] : []
        }
        const env = recordFromPairs(stdio.env)
        if (env) entry.env = env
        entries.push(entry)
        break
      }
    }
  }

  return { entries, skipped }
}

/**
 * Translate for a pi spawn and report every skipped server through `warn`
 * (stderr by default; ACP clients capture the adapter's stderr).
 */
export function toMcpSpawnEntries(
  servers: ReadonlyArray<McpServer> | undefined | null,
  warn: (message: string) => void = (message) => console.error(message)
): PiMcpEntry[] {
  const { entries, skipped } = translateAcpMcpServers(servers)
  for (const server of skipped) {
    warn(`pi-acp: skipping MCP server "${server.name}": ${server.reason}`)
  }
  return entries
}
