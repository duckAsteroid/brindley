// Wiring: opening the pane, the two commands, refreshing, and the pane's actions.

import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Detail, Initiative, Load, PaneView } from '../types'
import { NO_COLLECTIONS, loadDetail, loadSnapshot, type Io } from './lib/load'
import { DEFAULT_OPTIONS, resolveOptions, type Options } from './lib/options'
import { reconcileView, renderPane, type PaneActions } from './lib/pane'
import { applyPin, resolvePinArg } from './lib/pin'
import { closedMarkKey, serverToolPrefix, shouldRefresh } from './lib/refresh'
import { queueText } from './lib/text'

const PANE_ID = 'brindley'
const TITLE = 'Initiatives'
const REFRESH_MS = 5000

// $.state atoms. The engine's scan reads them from consts of the file that uses
// them. Change a shape tag when its value's fields change: a value an earlier
// version stored outlives a reload and is then declined.
const loadAtom = atom({ plugin: 'brindley-sidebar', key: 'load' } as const, null as Load | null, { shape: 'load-2' })
const viewAtom = atom({ plugin: 'brindley-sidebar', key: 'view' } as const, { mode: 'list' } as PaneView, {
  shape: 'view-1',
})
const expandedAtom = atom({ plugin: 'brindley-sidebar', key: 'expanded' } as const, false, { shape: 'expanded-1' })

const closedKey = (checkout: string) => `closed:${checkout}`
const pinKey = (checkout: string) => `pin:${checkout}`

// Module state, rebuilt at each load: the options, the last load before the
// pin (the last good one once there is one), whether the pane was opened
// unasked and has not been drawn yet, and the refresh timer while it is open.
// Functions that take $ sit at the top of the file, where the engine's scan
// follows them.
let options: Options = DEFAULT_OPTIONS
let prefix = serverToolPrefix(DEFAULT_OPTIONS.server)
let full: Load | null = null
let openedUnasked = false
let ticker: { cancel(): void } | null = null
// Collections too large to list in one MCP result: listed by status.
const split = new Set<string>()
// Loads started and the newest landed, by number; whether a background
// refresh runs, and whether another was asked for meanwhile.
let loadsStarted = 0
let loadsLanded = 0
let isRefreshing = false
let isDirty = false

function ioOf($: EngineInterface): Io {
  return {
    call: (tool, args) => $.mcp.call(options.server, tool, args),
    read: async path => {
      const text = await $.fs.read(path)
      return typeof text === 'string' ? text : ''
    },
  }
}

async function pinnedOf($: EngineInterface, load: Load): Promise<Load> {
  if (load.kind !== 'ok') return load
  const pin = await $.store.get(pinKey(load.snapshot.checkout))
  const { collections, items } = applyPin(
    load.snapshot.collections,
    load.snapshot.initiatives,
    typeof pin === 'string' ? pin : null,
  )
  return { kind: 'ok', snapshot: { ...load.snapshot, collections, initiatives: items } }
}

/** Puts the last load, pin applied, where the pane reads it. */
async function publish($: EngineInterface) {
  if (full === null) return
  const shown = await pinnedOf($, full)
  await update($, loadAtom, () => shown)
  await update($, viewAtom, view => reconcileView(view, shown))
}

/**
 * One load, awaited by its caller. Loads may overlap: each is numbered, and
 * one that lands after a newer one has landed is dropped. A failure after a
 * good load keeps the good one. Never wait on a load another dispatch started:
 * in a headless run that load does not move while a command waits.
 */
async function loadNow($: EngineInterface): Promise<Load> {
  const seq = ++loadsStarted
  const load = await loadSnapshot(ioOf($), options.exclude, split)
  if (seq > loadsLanded) {
    loadsLanded = seq
    if (load.kind === 'ok' || full === null || full.kind === 'none') full = load
    await publish($)
  }
  return full ?? load
}

/**
 * A background refresh (the timer, a tool call), which nothing awaits: one at
 * a time, and one asked for while another runs is done once after it.
 */
async function refresh($: EngineInterface): Promise<void> {
  if (isRefreshing) {
    isDirty = true
    return
  }
  isRefreshing = true
  try {
    do {
      isDirty = false
      await loadNow($)
    } while (isDirty)
  } finally {
    isRefreshing = false
  }
}

function startTicker($: EngineInterface) {
  if (ticker !== null) return
  ticker = $.clock.every(REFRESH_MS, () => void refresh($))
}

function stopTicker() {
  ticker?.cancel()
  ticker = null
}

/** Open and drawn. An unasked open below 144 columns waits undrawn: not open to the person. */
async function isOpen($: EngineInterface): Promise<boolean> {
  return (await $.ui.panes()).some(pane => pane.id === PANE_ID && pane.isPlaced)
}

async function openPane($: EngineInterface, unasked: boolean) {
  openedUnasked = unasked
  startTicker($)
  await $.ui.open({ id: PANE_ID, title: TITLE })
}

async function closePane($: EngineInterface) {
  openedUnasked = false
  stopTicker()
  await $.ui.close({ id: PANE_ID })
}

// Waits before each retry of a boot load that failed on the MCP call: the
// server may still be connecting when the session starts.
const BOOT_RETRY_MS = [1000, 2000, 4000, 8000, 16000]

/** After session start: load, and open unasked where the spec allows. */
async function boot($: EngineInterface, surface: string | null, attempt = 0) {
  const load = await loadNow($)
  const wait = BOOT_RETRY_MS[attempt]
  if (load.kind === 'none' && load.reason !== NO_COLLECTIONS && wait !== undefined) {
    $.clock.after(wait, () => void boot($, surface, attempt + 1))
    return
  }
  if (await isOpen($)) {
    // Reloaded with the pane up: keep it refreshing.
    startTicker($)
    return
  }
  if (surface !== 'terminal' || load.kind !== 'ok') return
  if ((await $.store.get(closedKey(load.snapshot.checkout))) === true) return
  await openPane($, true)
}

export const register: Register = (on, rawOptions) => {
  options = resolveOptions(rawOptions)
  prefix = serverToolPrefix(options.server)
  full = null
  openedUnasked = false
  ticker = null
  split.clear()
  loadsStarted = 0
  loadsLanded = 0
  isRefreshing = false
  isDirty = false

  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'initiatives', description: 'Show or hide the Brindley initiatives pane' })
    await $.command.register({
      name: 'brindley',
      description: 'Pin the initiatives pane to one Brindley collection, or all',
      argumentHint: '[all | number | name | alias | path]',
    })
    const expanded = await $.store.get('expanded')
    await update($, expandedAtom, () => expanded === true)
    // The first load waits on the MCP server: do it after the session has started.
    $.clock.after(0, () => void boot($, e.surface))
    return next(e)
  })

  on('ui.close', { id: PANE_ID }, async ($, e, next) => {
    const result = await next(e)
    stopTicker()
    openedUnasked = false
    const mark = closedMarkKey(e.origin.kind, full)
    if (mark !== null) await $.store.set(mark, true)
    return result
  }).catch(($, e, next) => next(e)) // observes only: never keeps a pane open

  on('command.run', { command: 'initiatives' }, async $ => {
    if (await isOpen($)) {
      await closePane($)
      // The person closed it, by command rather than the close mark.
      if (full?.kind === 'ok') await $.store.set(closedKey(full.snapshot.checkout), true)
      return { text: 'Initiatives pane closed.' }
    }
    const load = full?.kind === 'ok' ? full : await loadNow($)
    if (load.kind !== 'ok') return { text: load.reason }
    await $.store.delete(closedKey(load.snapshot.checkout))
    await openPane($, false)
    return { text: 'Initiatives pane opened.' }
  })

  on('command.run', { command: 'brindley' }, async ($, e) => {
    const load = full?.kind === 'ok' ? full : await loadNow($)
    if (load.kind !== 'ok') return { text: load.reason }
    const { checkout, collections } = load.snapshot
    const arg = (e.args ?? '').trim()

    if (arg === '') {
      const pin = await $.store.get(pinKey(checkout))
      const lines = collections.map(
        (c, n) => `${n + 1}. ${c.name} — ${c.path}${c.path === pin ? ' (pinned)' : ''}`,
      )
      const all = typeof pin === 'string' && collections.some(c => c.path === pin) ? '' : ' (current)'
      return { text: ['Brindley collections:', ...lines, `all — every collection${all}`, '', 'Pin one with /brindley <number|name|path>, or /brindley all.'].join('\n') }
    }

    const resolved = resolvePinArg(arg, collections)
    if ('error' in resolved) return { text: resolved.error }
    if (resolved.pin === null) await $.store.delete(pinKey(checkout))
    else await $.store.set(pinKey(checkout), resolved.pin)
    await publish($)
    return { text: resolved.pin === null ? 'Showing every collection.' : `Pinned to ${resolved.pin}.` }
  })

  on('tool.call', async ($, e, next) => {
    const result = await next(e)
    const checkout = full?.kind === 'ok' ? full.snapshot.checkout : ''
    const paths = full?.kind === 'ok' ? full.snapshot.collections.map(c => c.path) : []
    if (shouldRefresh(String(e.tool), e, prefix, checkout, paths)) {
      // After the call completes, without holding up its result.
      $.clock.after(0, () => void refresh($))
    }
    return result
  }).catch(($, e, next) => next(e)) // observes only: never refuses a tool call

  on('ui.render', { component: 'Pane', requestId: PANE_ID }, async ($, e) => {
    if (openedUnasked) {
      openedUnasked = false
      // Opened unasked: keep it only where it sits beside the chat. A render
      // must not change the UI, so close it just after.
      if (e.viewport?.isFullscreen !== true || e.props.placement === 'inline') {
        $.clock.after(0, () => void closePane($))
      }
    }

    const state = {
      load: await read($, loadAtom),
      view: await read($, viewAtom),
      expanded: await read($, expandedAtom),
    }

    const showDetail = async (i: Initiative) => {
      let detail: Detail
      try {
        detail = await loadDetail(ioOf($), i.ref)
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        detail = {
          ref: i.ref,
          goal: `Could not read it from Brindley: ${message}`,
          updated: i.updated,
          blockers: i.blockedBy,
          openQuestions: i.openQuestions,
        }
      }
      await update($, viewAtom, (view): PaneView => (view.mode === 'detail' && view.ref === i.ref ? { ...view, detail } : view))
    }

    const actions: PaneActions = {
      toggle: () => void update($, expandedAtom, expanded => !expanded).then(expanded => $.store.set('expanded', expanded)),
      open: ref => {
        const i = state.load?.kind === 'ok' ? state.load.snapshot.initiatives.find(one => one.ref === ref) : undefined
        if (!i) return
        void update($, viewAtom, (): PaneView => ({ mode: 'detail', ref, detail: null })).then(() => showDetail(i))
      },
      back: () => void update($, viewAtom, (): PaneView => ({ mode: 'list' })),
      queue: i => void $.prompt.submit({ text: queueText(i) }).then(() => $.ui.toast(`Queued ${i.displayRef}`)),
      copy: i =>
        void $.ui.copy({ text: i.displayRef, surface: e.surface }).then(() => $.ui.toast(`Copied ${i.displayRef}`)),
    }
    return renderPane($, e, state, options, actions)
  })
}
