// The brindley-sidebar mod's $.state contract, and the data types it holds.

export type Collection = {
  name: string
  path: string
  aliases: string[]
  /** Brindley's own counts by core status (`collections`). */
  counts: Record<string, number>
}

export type Tier = 'active' | 'draft' | 'settled'

export type Initiative = {
  /** Brindley's canonical ref, used to ask for it (`get`). */
  ref: string
  /** `<alias or name>#<number>`: shown, copied and queued. */
  displayRef: string
  collectionPath: string
  title: string
  type: string | null
  status: string | null
  tier: Tier
  priority: string | null
  blockedBy: string[]
  openQuestions: number
  path: string
  updated: string | null
}

export type Snapshot = { checkout: string; collections: Collection[]; initiatives: Initiative[] }

export type Load = { kind: 'ok'; snapshot: Snapshot } | { kind: 'none'; reason: string }

export type Detail = { ref: string; goal: string; updated: string | null; blockers: string[]; openQuestions: number }

export type PaneView = { mode: 'list' } | { mode: 'detail'; ref: string; detail: Detail | null }

declare module 'claude-code' {
  interface PluginState {
    'brindley-sidebar': {
      /** The last good load, pin applied; null before the first. */
      load: Shaped<Load | null>
      view: Shaped<PaneView>
      expanded: Shaped<boolean>
    }
  }
}
