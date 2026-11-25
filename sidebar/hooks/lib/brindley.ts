// Reading the Brindley MCP server's results.

export type McpResultLike = {
  content: readonly { type: string; text?: string }[]
  isError?: boolean
}

import type { Collection } from '../../types'

export type { Collection }

export type RawInitiative = {
  ref: string
  collection: string
  number: number
  title: string
  type: string | null
  status: string | null
  dimensions: Record<string, { value?: string | null } | undefined>
  blockedBy: unknown[]
  openQuestions: number
  path: string
}

/**
 * `error`: Brindley reported an error. `not-json`: the text is not Brindley's
 * JSON, as when Claude Code hands back a notice in place of a result over its
 * MCP output cap.
 */
export class BrindleyError extends Error {
  readonly kind: 'error' | 'not-json'
  constructor(message: string, kind: 'error' | 'not-json' = 'error') {
    super(message)
    this.name = 'BrindleyError'
    this.kind = kind
  }
}

const CHECKOUT = 'Checkout: '

/**
 * Splits a result into its JSON and the checkout path Brindley appends, as its
 * own block or glued after the JSON. Throws BrindleyError on an error result or
 * text that is not JSON.
 */
export function parseResult(result: McpResultLike): { data: unknown; checkout: string | null } {
  const text = result.content.map(block => block.text ?? '').join('\n')
  if (result.isError) throw new BrindleyError(text.trim() || 'Brindley returned an error')

  let json = text
  let checkout: string | null = null
  const at = text.lastIndexOf(CHECKOUT)
  if (at >= 0) {
    json = text.slice(0, at)
    const line = text.slice(at + CHECKOUT.length).split('\n')[0] ?? ''
    const paren = line.indexOf(' (')
    checkout = (paren >= 0 ? line.slice(0, paren) : line).trim() || null
  }

  try {
    return { data: JSON.parse(json.trim()), checkout }
  } catch {
    throw new BrindleyError(`Brindley returned text that is not JSON: ${json.trim().slice(0, 120)}`, 'not-json')
  }
}

const record = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === 'object' ? (value as Record<string, unknown>) : {}

// A list arrives bare, or from Brindley 5 in a repository with other worktrees
// as { result: [...], worktree }.
const list = (data: unknown): unknown[] => {
  if (Array.isArray(data)) return data
  const wrapped = record(data).result
  return Array.isArray(wrapped) ? wrapped : []
}

const str = (value: unknown): string | null => (typeof value === 'string' ? value : null)

export function toCollections(data: unknown): Collection[] {
  return list(data).map(item => {
    const c = record(item)
    const aliases = Array.isArray(c.aliases) ? c.aliases.filter((a): a is string => typeof a === 'string') : []
    const counts = Object.fromEntries(
      Object.entries(record(c.counts)).filter((entry): entry is [string, number] => typeof entry[1] === 'number'),
    )
    return { name: str(c.collection) ?? '', path: str(c.path) ?? '', aliases, counts }
  })
}

export function toRawInitiatives(data: unknown): RawInitiative[] {
  return list(data).map(item => {
    const i = record(item)
    return {
      ref: str(i.ref) ?? '',
      collection: str(i.collection) ?? '',
      number: typeof i.number === 'number' ? i.number : 0,
      title: str(i.title) ?? '',
      type: str(i.type),
      status: str(i.status),
      dimensions: record(i.dimensions) as RawInitiative['dimensions'],
      blockedBy: Array.isArray(i.blockedBy) ? i.blockedBy : [],
      openQuestions: typeof i.openQuestions === 'number' ? i.openQuestions : 0,
      path: str(i.path) ?? '',
    }
  })
}
