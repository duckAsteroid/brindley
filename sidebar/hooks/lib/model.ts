// Initiatives as the pane shows them: tiers, glyphs, ordering, counts, rows.

import type { Collection, Initiative, Tier } from '../../types'
import type { RawInitiative } from './brindley'

export type { Initiative, Tier }

export type Order = 'status-recency' | 'status-priority' | 'recency' | 'priority'

// Brindley's core statuses. Brindley has already mapped aliases onto these.
const TIERS: Record<string, Tier> = {
  'in-progress': 'active',
  designed: 'active',
  draft: 'draft',
  done: 'settled',
  deferred: 'settled',
  abandoned: 'settled',
  superseded: 'settled',
}

export function isRecognised(status: string | null): boolean {
  return status !== null && Object.hasOwn(TIERS, status)
}

/** An unrecognised or missing status is a draft, so it stays visible. */
export function tierFor(status: string | null): Tier {
  return status !== null && isRecognised(status) ? (TIERS[status] as Tier) : 'draft'
}

export function glyphFor(i: Initiative): '▶' | '◆' | '○' | '?' {
  if (!isRecognised(i.status)) return '?'
  if (i.status === 'in-progress') return '▶'
  if (i.status === 'designed') return '◆'
  return '○'
}

/** The type's first letter; blank for feature (the unremarkable majority) and none. */
export function typeMark(type: string | null): string {
  const key = (type ?? '').trim().toLowerCase()
  if (!key || key === 'feature') return ' '
  return key[0] as string
}

function collectionFor(raw: RawInitiative, collections: Collection[]): Collection | undefined {
  // By path first: two collections can share a name.
  const byPath = collections
    .filter(c => c.path !== '' && raw.path.startsWith(c.path + '/'))
    .sort((a, b) => b.path.length - a.path.length)[0]
  return byPath ?? collections.find(c => c.name === raw.collection)
}

const refOf = (value: unknown): string | null => {
  if (typeof value === 'string') return value
  if (value !== null && typeof value === 'object' && typeof (value as { ref?: unknown }).ref === 'string') {
    return (value as { ref: string }).ref
  }
  return null
}

export function toInitiative(raw: RawInitiative, collections: Collection[], updated: string | null): Initiative {
  const collection = collectionFor(raw, collections)
  const prefix = collection ? (collection.aliases[0] ?? collection.name) : raw.collection
  const priority = raw.dimensions.priority?.value
  return {
    ref: raw.ref,
    displayRef: `${prefix}#${raw.number}`,
    collectionPath: collection?.path ?? '',
    title: raw.title,
    type: raw.type,
    status: raw.status,
    tier: tierFor(raw.status),
    priority: typeof priority === 'string' ? priority : null,
    blockedBy: raw.blockedBy.map(refOf).filter((r): r is string => r !== null),
    openQuestions: raw.openQuestions,
    path: raw.path,
    updated,
  }
}

const TIER_RANK: Record<Tier, number> = { active: 0, draft: 1, settled: 2 }
const PRIORITY_RANK: Record<string, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  normal: 2,
  low: 3,
  trivial: 4,
}

function priorityRank(i: Initiative): number {
  if (!i.priority) return 99
  return PRIORITY_RANK[i.priority.toLowerCase()] ?? 98
}

function recencyRank(i: Initiative): number {
  if (!i.updated) return Number.POSITIVE_INFINITY
  const time = Date.parse(i.updated)
  return Number.isNaN(time) ? Number.POSITIVE_INFINITY : -time
}

function compare(a: Initiative, b: Initiative, order: Order): number {
  const tier = TIER_RANK[a.tier] - TIER_RANK[b.tier]
  if (order === 'status-recency') return tier || recencyRank(a) - recencyRank(b)
  if (order === 'status-priority') return tier || priorityRank(a) - priorityRank(b)
  if (order === 'priority') return priorityRank(a) - priorityRank(b) || tier
  return recencyRank(a) - recencyRank(b)
}

export function orderInitiatives(items: Initiative[], order: Order): Initiative[] {
  return [...items].sort((a, b) => {
    const result = compare(a, b, order)
    // Infinity - Infinity is NaN: two undated initiatives tie.
    return (Number.isNaN(result) ? 0 : result) || a.ref.localeCompare(b.ref)
  })
}

/**
 * The counts line: Brindley's own counts per collection, plus the initiatives
 * whose status Brindley does not recognise (it does not count them), as draft.
 */
export function summarise(
  collections: Collection[],
  items: Initiative[],
): { active: number; draft: number; deferred: number; done: number } {
  const total = (status: string) => collections.reduce((sum, c) => sum + (c.counts[status] ?? 0), 0)
  return {
    active: total('in-progress') + total('designed'),
    draft: total('draft') + items.filter(i => !isRecognised(i.status)).length,
    deferred: total('deferred'),
    done: total('done') + total('abandoned') + total('superseded'),
  }
}

export function rowsFor(items: Initiative[], order: Order, maxRows: number, expanded: boolean): Initiative[] {
  const wanted: Tier[] = expanded ? ['active', 'draft'] : ['active']
  const ordered = orderInitiatives(
    items.filter(i => wanted.includes(i.tier)),
    order,
  )
  return expanded ? ordered : ordered.slice(0, maxRows)
}
