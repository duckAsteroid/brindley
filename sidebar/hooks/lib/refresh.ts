// When a completed tool call should refresh the pane, and when a close marks the project.

import type { Load } from '../../types'

/** The tool-name prefix the engine gives an MCP server's tools. */
export function serverToolPrefix(server: string): string {
  return `mcp__${server.replace(/[^A-Za-z0-9_-]/g, '_')}__`
}

const EDITS = new Set(['Edit', 'Write', 'NotebookEdit'])

export function shouldRefresh(
  toolName: string,
  input: unknown,
  prefix: string,
  checkout: string,
  collectionPaths: readonly string[],
): boolean {
  if (toolName.startsWith(prefix)) return true
  if (!EDITS.has(toolName)) return false
  const i = input !== null && typeof input === 'object' ? (input as Record<string, unknown>) : {}
  const path = typeof i.file_path === 'string' ? i.file_path : typeof i.notebook_path === 'string' ? i.notebook_path : null
  if (path === null) return false
  const root = checkout.replace(/\/+$/, '') + '/'
  if (path.startsWith('/') && !path.startsWith(root)) return false
  const relative = path.startsWith(root) ? path.slice(root.length) : path
  return collectionPaths.some(c => relative === c || relative.startsWith(c + '/'))
}

/**
 * The store key that marks the project closed when the pane closes, or null:
 * only the person's close counts, not the mod's own or an unload.
 */
export function closedMarkKey(origin: 'plugin' | 'person' | 'unload', load: Load | null): string | null {
  return origin === 'person' && load?.kind === 'ok' ? `closed:${load.snapshot.checkout}` : null
}
