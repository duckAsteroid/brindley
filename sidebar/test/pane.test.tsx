import { expect, mock, test } from 'claude-code/testing'

import type { Initiative, Load, PaneView } from '../types'
import { reconcileView } from '../hooks/lib/pane'

const PANE = {
  plugin: 'brindley-sidebar',
  component: 'Pane',
  requestId: 'brindley',
  props: {
    title: 'Initiatives',
    isFocused: false,
    bodyColumns: 40,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 20 },
    view: {},
  },
} as const

const SHAPES: Record<string, string> = { load: 'load-2', view: 'view-1', expanded: 'expanded-1' }

type Seeds = { load?: Load | null; view?: PaneView; expanded?: boolean }

// Seeds the mod's $.state: a value answers reads until the mod writes that key.
// The hooks sit beneath the plugin; next(e) reaches the kit's own state.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function seed(on: any, values: Seeds) {
  mock.store(on)
  const seeds = new Map<string, unknown>(Object.entries(values))
  on('state.set', (_: unknown, e: { key: string }, next: (e: unknown) => unknown) => {
    seeds.delete(e.key)
    return next(e)
  })
  on('state.get', async (_: unknown, e: { plugin: string; key: string }, next: (e: unknown) => unknown) => {
    // Always ask the kit: its read subscribes the drawing, so a later write redraws it.
    const kit = await next(e)
    if (e.plugin === 'brindley-sidebar' && seeds.has(e.key)) {
      return { value: { value: { shape: SHAPES[e.key], value: seeds.get(e.key) }, version: 1 } }
    }
    return kit
  })
}

// Stands for the engine's answers to the calls the actions make.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function engine(on: any) {
  const submitted: string[] = []
  const copied: string[] = []
  const toasts: string[] = []
  on('prompt.submit', (_: unknown, e: { text: string }) => {
    submitted.push(e.text)
    return { text: e.text }
  })
  on('ui.copy', (_: unknown, e: { text: string }) => {
    copied.push(e.text)
    return { value: { isCopied: true } }
  })
  on('ui.toast', (_: unknown, e: { text: string }) => {
    toasts.push(e.text)
    return { value: undefined }
  })
  return { submitted, copied, toasts }
}

const make = (over: Partial<Initiative>): Initiative => ({
  ref: 'atlas#1',
  displayRef: 'at#1',
  collectionPath: 'docs/initiatives',
  title: 'Title',
  type: 'feature',
  status: 'designed',
  tier: 'active',
  priority: null,
  blockedBy: [],
  openQuestions: 0,
  path: 'docs/initiatives/01-title.md',
  updated: '2026-11-01',
  ...over,
})

const INITIATIVES: Initiative[] = [
  make({ ref: 'atlas#1', displayRef: 'at#1', title: 'Results go stale', status: 'in-progress', updated: '2026-11-10' }),
  make({ ref: 'atlas#2', displayRef: 'at#2', title: 'Blocked thing', type: 'bug', blockedBy: ['atlas#3'], updated: '2026-11-01' }),
  make({ ref: 'atlas#3', displayRef: 'at#3', title: 'A draft', status: 'draft', tier: 'draft' }),
  make({ ref: 'atlas#4', displayRef: 'at#4', title: 'Later', status: 'deferred', tier: 'settled' }),
  make({ ref: 'atlas#5', displayRef: 'at#5', title: 'Shipped', status: 'done', tier: 'settled' }),
]

const COUNTS = { 'in-progress': 1, designed: 1, draft: 1, deferred: 1, done: 1 }

const ok = (initiatives: Initiative[] = INITIATIVES, counts: Record<string, number> = COUNTS): Load => ({
  kind: 'ok',
  snapshot: {
    checkout: '/r',
    collections: [{ name: 'atlas', path: 'docs/initiatives', aliases: ['at'], counts }],
    initiatives,
  },
})

const rowsOf = async (ui: { findAll: (q: { type: string }) => Promise<{ key: string | undefined; text: string }[]> }) =>
  (await ui.findAll({ type: 'Button' })).filter(b => b.key?.startsWith('row:'))

test('with no data the pane shows the reason only', async ($, on) => {
  seed(on, { load: { kind: 'none', reason: 'No Brindley collections in this repository' } })
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  const texts = await ui.findAll({ type: 'Text' })
  expect(texts.map(t => t.text)).toEqual(['No Brindley collections in this repository'])
  expect(await ui.findAll({ type: 'Button' })).toHaveLength(0)
  await ui.unmount()
})

test('the list shows counts, the header and the active rows, on every surface', async ($, on) => {
  seed(on, { load: ok() })
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    expect((await ui.find({ type: 'Text', text: /active/ }))?.text).toBe('2 active, 1 draft · 1 deferred, 1 done')
    const header = await ui.find({ type: 'Button', key: 'toggle' })
    expect(header?.text).toContain('Pick up next')
    expect(header?.text).toContain('2')
    const rows = await rowsOf(ui)
    expect(rows.map(r => r.key)).toEqual(['row:atlas#1', 'row:atlas#2'])
    expect(rows[0]?.text).toContain('▶')
    expect(rows[0]?.text).toContain('at#1 Results go stale')
    await ui.unmount()
  }
})

test("the counts line is Brindley's counts", async ($, on) => {
  seed(on, { load: ok(INITIATIVES, { ...COUNTS, done: 40, abandoned: 2 }) })
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect((await ui.find({ type: 'Text', text: /active/ }))?.text).toBe('2 active, 1 draft · 1 deferred, 42 done')
  await ui.unmount()
})

test('pressing the header expands to the draft rows', async ($, on) => {
  seed(on, { load: ok() })
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await ui.press({ key: 'toggle' })
  const header = await ui.find({ type: 'Button', key: 'toggle' })
  expect(header?.text).toContain('▼')
  expect(header?.text).toContain('2 · 1')
  expect((await rowsOf(ui)).map(r => r.key)).toEqual(['row:atlas#1', 'row:atlas#2', 'row:atlas#3'])
  await ui.unmount()
})

test('an unrecognised status shows a red ?', async ($, on) => {
  seed(on, { load: ok([make({ ref: 'atlas#9', status: 'wat', tier: 'draft' })]), expanded: true })
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  const glyph = await ui.find({ type: 'Text', text: '?' })
  expect(glyph?.props.color).toBe('error')
  await ui.unmount()
})

test('a blocked row ends with ⊘', async ($, on) => {
  seed(on, { load: ok() })
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  const row = await ui.find({ type: 'Button', key: 'row:atlas#2' })
  expect(row?.text.trimEnd()).toEndWith('⊘')
  const plain = await ui.find({ type: 'Button', key: 'row:atlas#1' })
  expect(plain?.text).not.toContain('⊘')
  await ui.unmount()
})

test('a long title in a narrow pane is one Text cut with …', async ($, on) => {
  const title = 'x'.repeat(60)
  seed(on, { load: ok([make({ title })]) })
  const ui = await $.ui.mount({ ...PANE, props: { ...PANE.props, bodyColumns: 24 }, surface: 'terminal' })
  const cut = await ui.find({ type: 'Text', text: /…$/ })
  expect(cut).toBeDefined()
  expect(Array.from(cut?.text ?? '').length).toBeLessThanOrEqual(20)
  expect(cut?.props.wrap).toBe('truncate')
  await ui.unmount()
})

test('pressing a row opens its detail view', async ($, on) => {
  seed(on, { load: ok() })
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await ui.press({ key: 'row:atlas#2' })
  expect((await ui.find({ type: 'Text', text: /Blocked thing/ }))?.text).toBe('at#2 Blocked thing')
  expect(await ui.find({ type: 'Button', key: 'back' })).toBeDefined()
  await ui.unmount()
})

test('the detail view shows the initiative and its buttons act', async ($, on) => {
  const { submitted, copied, toasts } = engine(on)
  seed(on, {
    load: ok(),
    view: {
      mode: 'detail',
      ref: 'atlas#2',
      detail: { ref: 'atlas#2', goal: 'Make it work.', updated: '2026-11-20', blockers: ['3'], openQuestions: 2 },
    },
  })
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  const texts = (await ui.findAll({ type: 'Text' })).map(t => t.text)
  expect(texts).toContain('at#2 Blocked thing')
  expect(texts).toContain('designed · bug · 2026-11-20')
  expect(texts).toContain('Make it work.')
  expect(texts).toContain('Blocked by: 3')
  expect(texts).toContain('2 open questions')
  for (const key of ['queue', 'copy', 'back']) expect(await ui.find({ type: 'Button', key })).toBeDefined()

  await ui.press({ key: 'queue' })
  expect(submitted).toEqual(['Work on at#2 — Blocked thing. Read docs/initiatives/01-title.md first.'])
  await ui.press({ key: 'copy' })
  expect(copied).toEqual(['at#2'])
  expect(toasts).toEqual(['Queued at#2', 'Copied at#2'])

  await ui.press({ key: 'back' })
  expect((await ui.find({ type: 'Text', text: /active/ }))?.text).toBe('2 active, 1 draft · 1 deferred, 1 done')
  await ui.unmount()
})

test('reconcileView returns to the list when the ref is gone', () => {
  const view: PaneView = { mode: 'detail', ref: 'atlas#9', detail: null }
  expect(reconcileView(view, ok())).toEqual({ mode: 'list' })
  const kept: PaneView = { mode: 'detail', ref: 'atlas#1', detail: null }
  expect(reconcileView(kept, ok())).toEqual(kept)
  expect(reconcileView({ mode: 'list' }, ok())).toEqual({ mode: 'list' })
  expect(reconcileView(kept, { kind: 'none', reason: 'x' })).toEqual({ mode: 'list' })
})
