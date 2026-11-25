// Loading collections, initiatives and details from the Brindley MCP server.
// I/O comes in as functions so tests can stub it.

import type { Detail, Load, Snapshot } from '../../types'
import type { Collection } from '../../types'
import { BrindleyError, parseResult, toCollections, toRawInitiatives, type McpResultLike, type RawInitiative } from './brindley'
import { isExcluded } from './glob'
import { toInitiative } from './model'
import { goalOf, updatedOf } from './text'

export type Io = {
  call(tool: string, args?: Record<string, unknown>): Promise<McpResultLike>
  read(path: string): Promise<string>
}

export type { Detail, Load, Snapshot }

export const NO_COLLECTIONS = 'No Brindley collections in this repository'

const messageOf = (error: unknown): string => (error instanceof Error ? error.message : String(error))

const joinPath = (checkout: string, path: string): string =>
  checkout === '' || path.startsWith('/') ? path : `${checkout.replace(/\/+$/, '')}/${path}`

// The statuses the pane lists rows for. Settled initiatives are only counted,
// and Brindley's `collections` already gives those counts.
const OPEN_STATUSES = ['in-progress', 'designed', 'draft']

/**
 * One collection's initiatives. A collection whose list is over Claude Code's
 * MCP output cap is listed one open status at a time, and remembered in
 * `split` so later loads go straight there. Listed by status, an initiative
 * whose status Brindley does not recognise is not found.
 */
async function listCollection(
  io: Io,
  c: Collection,
  split: Set<string>,
): Promise<{ raws: RawInitiative[]; checkout: string | null }> {
  if (!split.has(c.path)) {
    try {
      const { data, checkout } = parseResult(await io.call('list', { collection: c.path }))
      return { raws: toRawInitiatives(data), checkout }
    } catch (error) {
      if (!(error instanceof BrindleyError && error.kind === 'not-json')) throw error
      split.add(c.path)
    }
  }
  const parts = await Promise.all(
    OPEN_STATUSES.map(async status => {
      try {
        return parseResult(await io.call('list', { collection: c.path, status }))
      } catch (error) {
        if (!(error instanceof BrindleyError && error.kind === 'not-json')) throw error
        throw new BrindleyError(
          `too many ${status} initiatives in ${c.path} for one MCP result (raise MAX_MCP_OUTPUT_TOKENS)`,
        )
      }
    }),
  )
  return { raws: parts.flatMap(p => toRawInitiatives(p.data)), checkout: parts[0]?.checkout ?? null }
}

/**
 * Loads the collections that `exclude` keeps and their initiatives. `split`
 * holds the collections to list by status; pass the same set to each load.
 */
export async function loadSnapshot(io: Io, exclude: readonly string[], split: Set<string> = new Set()): Promise<Load> {
  try {
    const listed = parseResult(await io.call('collections'))
    const all = toCollections(listed.data)
    const collections = all.filter(c => !isExcluded(c.path, exclude))
    if (collections.length === 0) return { kind: 'none', reason: NO_COLLECTIONS }

    const lists = await Promise.all(collections.map(c => listCollection(io, c, split)))
    const checkout = lists.find(l => l.checkout !== null)?.checkout ?? listed.checkout ?? ''
    const kept = new Set(collections.map(c => c.path))
    const raws = lists
      .flatMap(l => l.raws)
      .map(raw => ({ raw, initiative: toInitiative(raw, all, null) }))
      // Rows are active and draft work; settled work is counted from `collections`.
      .filter(({ initiative }) => kept.has(initiative.collectionPath) && initiative.tier !== 'settled')

    const texts = await Promise.allSettled(raws.map(({ raw }) => io.read(joinPath(checkout, raw.path))))
    const withUpdated = raws.map(({ initiative }, n) => {
      const text = texts[n]
      return { ...initiative, updated: text?.status === 'fulfilled' ? updatedOf(text.value) : null }
    })

    return { kind: 'ok', snapshot: { checkout, collections, initiatives: withUpdated } }
  } catch (error) {
    return { kind: 'none', reason: `Brindley MCP server: ${messageOf(error)}` }
  }
}

/** One initiative's detail, from `get`. Throws BrindleyError when the call fails. */
export async function loadDetail(io: Io, ref: string): Promise<Detail> {
  const { data } = parseResult(await io.call('get', { ref }))
  const d = data !== null && typeof data === 'object' ? (data as Record<string, unknown>) : {}
  const front = d.frontMatter !== null && typeof d.frontMatter === 'object' ? (d.frontMatter as Record<string, unknown>) : {}
  const dependencies = Array.isArray(d.dependencies) ? (d.dependencies as Record<string, unknown>[]) : []
  return {
    ref,
    goal: typeof d.body === 'string' ? goalOf(d.body) : '',
    updated: front.updated === undefined || front.updated === null ? null : String(front.updated),
    blockers: dependencies
      .filter(dep => dep.classification === 'blocking' || dep.classification === 'missing')
      .map(dep => String(dep.ref)),
    openQuestions: typeof d.openQuestions === 'number' ? d.openQuestions : 0,
  }
}
