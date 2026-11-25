// Pinning the pane to one collection, by path (two collections can share a name).

import type { Collection } from './brindley'
import type { Initiative } from './model'

export function applyPin(
  collections: Collection[],
  items: Initiative[],
  pinned: string | null,
): { collections: Collection[]; items: Initiative[] } {
  const collection = pinned === null ? undefined : collections.find(c => c.path === pinned)
  if (!collection) return { collections, items }
  return { collections: [collection], items: items.filter(i => i.collectionPath === collection.path) }
}

export function resolvePinArg(arg: string, collections: Collection[]): { pin: string | null } | { error: string } {
  const wanted = arg.trim()
  if (wanted.toLowerCase() === 'all') return { pin: null }

  if (/^\d+$/.test(wanted)) {
    const c = collections[Number(wanted) - 1]
    return c ? { pin: c.path } : { error: `No collection ${wanted}: there are ${collections.length}.` }
  }

  const byPath = collections.find(c => c.path === wanted.replace(/\/+$/, ''))
  if (byPath) return { pin: byPath.path }

  const lower = wanted.toLowerCase()
  const matches = collections.filter(
    c => c.name.toLowerCase() === lower || c.aliases.some(a => a.toLowerCase() === lower),
  )
  if (matches.length === 1) return { pin: (matches[0] as Collection).path }
  if (matches.length > 1) {
    return { error: `"${wanted}" names ${matches.length} collections: ${matches.map(c => c.path).join(', ')}. Pin one by its path or number.` }
  }
  return { error: `No collection matches "${wanted}".` }
}
