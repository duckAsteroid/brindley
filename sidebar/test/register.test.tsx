import { expect, mock, test } from 'claude-code/testing'

// The test runtime's real timer, for a wall-clock limit on a hang (the mod's lib has no DOM).
declare const setTimeout: (fn: () => void, ms: number) => unknown

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

const FULLSCREEN = { columns: 160, rows: 40, isFullscreen: true }

const reply = (value: unknown) => ({
  content: [
    { type: 'text', text: JSON.stringify(value) },
    { type: 'text', text: 'Checkout: /r (main)' },
  ],
  isError: false,
})

const COLLECTIONS = [
  { collection: 'atlas', path: 'docs/initiatives', aliases: ['at'], counts: { 'in-progress': 1, designed: 1 } },
  { collection: 'beta', path: 'beta/initiatives', counts: { designed: 1 } },
]

const item = (ref: string, path: string, status = 'designed') => ({
  ref,
  collection: ref.split('#')[0],
  number: Number(ref.split('#')[1]),
  title: `Title ${ref}`,
  type: 'feature',
  status,
  dimensions: {},
  blockedBy: [],
  openQuestions: 0,
  path,
})

const LIST = [
  item('atlas#1', 'docs/initiatives/01-a.md', 'in-progress'),
  item('atlas#2', 'docs/initiatives/02-b.md'),
  item('beta#1', 'beta/initiatives/01-c.md'),
]

type World = {
  collections?: unknown[]
  store?: Record<string, unknown>
}

// Stands for the engine beneath the plugin: Brindley over MCP, files, panes,
// commands, toasts, the store and the clock.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function world(on: any, options: World = {}) {
  const w = {
    mcpCalls: [] as string[],
    failMcp: false,
    opened: [] as { id: string; title?: string }[],
    closed: [] as string[],
    panes: new Set<string>(),
    // False while an open pane waits undrawn (an unasked open below 144 columns).
    placed: true,
    // While set, mcp.call waits on it: a load held in flight.
    gate: null as Promise<void> | null,
    // While set, only the next `list` call waits on it, holding that one load.
    gateOnce: null as Promise<void> | null,
    // What `list` answers; a test may change it between loads.
    list: [...LIST],
    store: new Map<string, unknown>(Object.entries(options.store ?? {})),
    clock: mock.clock(on),
  }
  on('mcp.call', async (_: unknown, e: { server: string; tool: string; args?: Record<string, unknown> }) => {
    w.mcpCalls.push(e.tool)
    if (w.gate) await w.gate
    if (e.tool === 'list' && w.gateOnce) {
      // Answers what the data was when asked, however late it lands.
      const answer = w.list.filter(i => !e.args?.collection || i.path.startsWith(`${String(e.args.collection)}/`))
      const held = w.gateOnce
      w.gateOnce = null
      await held
      return { value: reply(answer) }
    }
    if (w.failMcp) return { deny: `server "${e.server}" is not connected` }
    if (e.tool === 'collections') return { value: reply(options.collections ?? COLLECTIONS) }
    if (e.tool === 'list') {
      const a = e.args ?? {}
      return {
        value: reply(
          w.list.filter(i => !a.collection || i.path.startsWith(`${String(a.collection)}/`)).filter(
            i => !a.status || i.status === a.status,
          ),
        ),
      }
    }
    if (e.tool === 'get') return { value: reply({ ref: 'atlas#1', body: '## Goal\n\nG.\n', dependencies: [], openQuestions: 0 }) }
    return { deny: `unexpected ${e.tool}` }
  })
  on('fs.read', (_: unknown, e: { path: string }) => ({ value: `---\nupdated: 2026-11-0${e.path.length % 9}\n---\n` }))
  on('ui.open', (_: unknown, e: { id: string; title?: string }) => {
    w.opened.push({ id: e.id, title: e.title })
    w.panes.add(e.id)
    return { value: { isPlaced: true } }
  })
  on('ui.close', (_: unknown, e: { id: string }) => {
    w.closed.push(e.id)
    w.panes.delete(e.id)
    return { value: undefined }
  })
  on('ui.panes', () => ({
    value: [...w.panes].map(id => ({ id, title: 'Initiatives', isShown: w.placed, isFocused: false, isPlaced: w.placed })),
  }))
  on('ui.toast', () => ({ value: undefined }))
  on('command.register', (_: unknown, e: { name: string }) => ({ value: { command: e.name } }))
  on('store.get', (_: unknown, e: { key: string }) => ({ value: w.store.get(e.key) }))
  on('store.set', (_: unknown, e: { key: string; value: unknown }) => {
    w.store.set(e.key, e.value)
    return { value: undefined }
  })
  on('store.delete', (_: unknown, e: { key: string }) => {
    w.store.delete(e.key)
    return { value: undefined }
  })
  on('session.start', (_: unknown, e: { cwd: string }) => ({ cwd: e.cwd }))
  on('tool.call', () => ({ result: {} }))
  return w
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function start($: any, w: ReturnType<typeof world>, surface: 'terminal' | 'desktop' = 'terminal') {
  await $.session.start({ cwd: '/r', surface, isInteractive: true })
  await w.clock.settle()
}

// Runs a slash command as the person typing it at a fullscreen terminal.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const run = ($: any, command: string, args = ''): Promise<{ text?: string }> =>
  $.command.run({ command, args, origin: { kind: 'composer' }, presentation: { isFullscreen: true, columns: 160 } })

test('session start on the terminal with data opens the pane', async ($, on) => {
  const w = world(on)
  await start($, w)
  expect(w.opened).toEqual([{ id: 'brindley', title: 'Initiatives' }])
})

test('session start on another surface opens nothing', async ($, on) => {
  const w = world(on)
  await start($, w, 'desktop')
  expect(w.opened).toEqual([])
})

test('session start in a project marked closed opens nothing', async ($, on) => {
  const w = world(on, { store: { 'closed:/r': true } })
  await start($, w)
  expect(w.opened).toEqual([])
})

test('session start with no collections opens nothing', async ($, on) => {
  const w = world(on, { collections: [] })
  await start($, w)
  expect(w.opened).toEqual([])
})

test('session start with the server missing opens nothing', async ($, on) => {
  const w = world(on)
  w.failMcp = true
  await start($, w)
  expect(w.opened).toEqual([])
})

test('a server still connecting at session start is tried again, and the pane opens', async ($, on) => {
  const w = world(on)
  w.failMcp = true
  await start($, w)
  expect(w.opened).toEqual([])
  w.failMcp = false
  await w.clock.advance(1000)
  expect(w.opened).toEqual([{ id: 'brindley', title: 'Initiatives' }])
})

test('a repository with no collections is not tried again', async ($, on) => {
  const w = world(on, { collections: [] })
  await start($, w)
  await w.clock.advance(60_000)
  expect(w.mcpCalls.filter(t => t === 'collections')).toHaveLength(1)
})

test('the first render closes an unasked pane that is not fullscreen, without marking it closed', async ($, on) => {
  const w = world(on)
  await start($, w)
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal', viewport: { columns: 160, rows: 40, isFullscreen: false } })
  await w.clock.settle()
  expect(w.closed).toEqual(['brindley'])
  expect(w.store.has('closed:/r')).toBe(false)
  await ui.unmount()
})

test('the first render closes an unasked pane seated inline', async ($, on) => {
  const w = world(on)
  await start($, w)
  const ui = await $.ui.mount({ ...PANE, props: { ...PANE.props, placement: 'inline' }, surface: 'terminal', viewport: FULLSCREEN })
  await w.clock.settle()
  expect(w.closed).toEqual(['brindley'])
  await ui.unmount()
})

test('a docked fullscreen pane stays open', async ($, on) => {
  const w = world(on)
  await start($, w)
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal', viewport: FULLSCREEN })
  await w.clock.settle()
  expect(w.closed).toEqual([])
  expect((await ui.find({ type: 'Text', text: /active/ }))?.text).toBe('3 active, 0 draft · 0 deferred, 0 done')
  await ui.unmount()
})

test('/initiatives opens the pane and clears the closed mark', async ($, on) => {
  const w = world(on, { store: { 'closed:/r': true } })
  await start($, w)
  expect(w.opened).toEqual([])
  const result = await run($, 'initiatives')
  expect(w.opened).toEqual([{ id: 'brindley', title: 'Initiatives' }])
  expect(w.store.has('closed:/r')).toBe(false)
  expect(result.text).toContain('opened')
})

test('/initiatives closes an open pane', async ($, on) => {
  const w = world(on)
  await start($, w)
  await run($, 'initiatives')
  expect(w.closed).toEqual(['brindley'])
})

test('/initiatives places a pane that waits undrawn instead of closing it', async ($, on) => {
  const w = world(on)
  w.placed = false
  await start($, w)
  expect(w.opened).toHaveLength(1)
  const result = await run($, 'initiatives')
  expect(w.closed).toEqual([])
  expect(w.opened).toHaveLength(2)
  expect(w.store.has('closed:/r')).toBe(false)
  expect(result.text).toContain('opened')
})

test('/initiatives with no data says why', async ($, on) => {
  const w = world(on, { collections: [] })
  await start($, w)
  const result = await run($, 'initiatives')
  expect(result.text).toBe('No Brindley collections in this repository')
  expect(w.opened).toEqual([])
})

test('/brindley with no args lists the collections and marks the pin', async ($, on) => {
  const w = world(on, { store: { 'pin:/r': 'beta/initiatives' } })
  await start($, w)
  const result = await run($, 'brindley')
  expect(result.text).toContain('1. atlas — docs/initiatives')
  expect(result.text).toContain('2. beta — beta/initiatives (pinned)')
})

test('/brindley pins by number and all clears it', async ($, on) => {
  const w = world(on)
  await start($, w)
  await run($, 'brindley', '2')
  expect(w.store.get('pin:/r')).toBe('beta/initiatives')
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal', viewport: FULLSCREEN })
  expect((await ui.find({ type: 'Text', text: /active/ }))?.text).toBe('1 active, 0 draft · 0 deferred, 0 done')
  await run($, 'brindley', 'all')
  expect(w.store.has('pin:/r')).toBe(false)
  expect((await ui.find({ type: 'Text', text: /active/ }))?.text).toBe('3 active, 0 draft · 0 deferred, 0 done')
  await ui.unmount()
})

test('/brindley with an unknown arg says so', async ($, on) => {
  const w = world(on)
  await start($, w)
  const result = await run($, 'brindley', 'nope')
  expect(result.text).toBe('No collection matches "nope".')
  expect(w.store.has('pin:/r')).toBe(false)
})

test('a Brindley tool call refreshes', async ($, on) => {
  const w = world(on)
  await start($, w)
  const before = w.mcpCalls.filter(t => t === 'collections').length
  await $.tool.call({ tool: 'mcp__plugin_brindley_core__update', ref: 'atlas#1' })
  await w.clock.settle()
  expect(w.mcpCalls.filter(t => t === 'collections').length).toBe(before + 1)
})

test('an edit outside the collections does not refresh', async ($, on) => {
  const w = world(on)
  await start($, w)
  const before = w.mcpCalls.length
  await $.tool.call({ tool: 'Edit', file_path: '/r/src/x.ts', old_string: 'a', new_string: 'b' })
  await w.clock.settle()
  expect(w.mcpCalls.length).toBe(before)
})

test('refreshes asked for during a load run once after it, not side by side', async ($, on) => {
  const w = world(on)
  await start($, w)
  let release = () => {}
  w.gate = new Promise<void>(resolve => (release = resolve))
  const before = w.mcpCalls.filter(t => t === 'collections').length
  for (let n = 0; n < 3; n++) await $.tool.call({ tool: 'mcp__plugin_brindley_core__update', ref: 'atlas#1' })
  await w.clock.settle()
  expect(w.mcpCalls.filter(t => t === 'collections').length).toBe(before + 1)
  w.gate = null
  release()
  await w.clock.settle()
  expect(w.mcpCalls.filter(t => t === 'collections').length).toBe(before + 2)
})

test("a command does not wait on a load another dispatch started", async ($, on) => {
  const w = world(on, { collections: [COLLECTIONS[0]] })
  let release = () => {}
  w.gateOnce = new Promise<void>(resolve => (release = resolve))
  await $.session.start({ cwd: '/r', surface: 'desktop', isInteractive: true })
  await w.clock.settle() // boot's load is now held at the gate
  const result = await Promise.race([
    run($, 'initiatives'),
    new Promise<{ text: string }>(resolve => setTimeout(() => resolve({ text: 'hung' }), 1000)),
  ])
  expect(result.text).toContain('opened')
  release()
  await w.clock.settle()
})

test('a load that lands after a newer one is dropped', async ($, on) => {
  const w = world(on, { collections: [COLLECTIONS[0]] })
  let release = () => {}
  w.gateOnce = new Promise<void>(resolve => (release = resolve))
  await $.session.start({ cwd: '/r', surface: 'desktop', isInteractive: true })
  await w.clock.settle() // boot's load (atlas#1 and atlas#2) held at the gate
  w.list = w.list.filter(i => i.ref !== 'atlas#2')
  await run($, 'initiatives') // a newer load: atlas#1 alone
  release()
  await w.clock.settle()
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal', viewport: FULLSCREEN })
  expect((await ui.findAll({ type: 'Button' })).filter(b => b.key?.startsWith('row:')).map(b => b.key)).toEqual(['row:atlas#1'])
  await ui.unmount()
})

test('the pane refreshes every 5 seconds while open', async ($, on) => {
  const w = world(on)
  await start($, w)
  const before = w.mcpCalls.filter(t => t === 'collections').length
  await w.clock.advance(5000)
  expect(w.mcpCalls.filter(t => t === 'collections').length).toBe(before + 1)
})

test('a refresh that fails keeps the last good load', async ($, on) => {
  const w = world(on)
  await start($, w)
  w.failMcp = true
  await w.clock.advance(5000)
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal', viewport: FULLSCREEN })
  expect((await ui.find({ type: 'Text', text: /active/ }))?.text).toBe('3 active, 0 draft · 0 deferred, 0 done')
  await ui.unmount()
})

test('expanded is seeded from the store and the toggle writes it back', async ($, on) => {
  const w = world(on, { store: { expanded: true } })
  await start($, w)
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal', viewport: FULLSCREEN })
  expect((await ui.find({ type: 'Button', key: 'toggle' }))?.text).toContain('▼')
  await ui.press({ key: 'toggle' })
  expect(w.store.get('expanded')).toBe(false)
  expect((await ui.find({ type: 'Button', key: 'toggle' }))?.text).toContain('▶')
  await ui.unmount()
})

test('pressing a row loads its detail', async ($, on) => {
  const w = world(on)
  await start($, w)
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal', viewport: FULLSCREEN })
  await ui.press({ key: 'row:atlas#1' })
  await w.clock.settle()
  expect(w.mcpCalls).toContain('get')
  expect((await ui.find({ type: 'Text', text: 'G.' }))?.text).toBe('G.')
  await ui.unmount()
})
