import { expect, test } from 'claude-code/testing'

import type { McpResultLike } from '../hooks/lib/brindley'
import { loadDetail, loadSnapshot, type Io } from '../hooks/lib/load'

const reply = (value: unknown, checkout = '/r'): McpResultLike => ({
  content: [
    { type: 'text', text: JSON.stringify(value) },
    { type: 'text', text: `Checkout: ${checkout} (main)` },
  ],
})

const COLLECTIONS = [
  { collection: 'atlas', path: 'docs/initiatives', aliases: ['at'], counts: { designed: 1, draft: 1, done: 1 } },
  { collection: 'corpus', path: 'test/test-corpus/initiatives', counts: { designed: 1 } },
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
  item('atlas#1', 'docs/initiatives/01-a.md'),
  item('atlas#2', 'docs/initiatives/02-b.md', 'draft'),
  item('atlas#3', 'docs/initiatives/03-c.md', 'done'),
  item('corpus#1', 'test/test-corpus/initiatives/01-c.md'),
]

// What `list` answers for its filters, as Brindley does.
const listed = (args: Record<string, unknown> = {}) =>
  LIST.filter(i => !args.collection || i.path.startsWith(`${String(args.collection)}/`)).filter(
    i => !args.status || i.status === args.status,
  )

// What Claude Code hands back in place of a result over its MCP output cap.
const OVERSIZED = {
  content: [{ type: 'text', text: 'Error: result (154,113 characters) exceeds maximum allowed tokens. Output has been saved to /x.txt' }],
}

function stubIo(over: Partial<Io> & { files?: Record<string, string> } = {}): Io & { reads: string[]; calls: string[] } {
  const reads: string[] = []
  const calls: string[] = []
  const files = over.files ?? {
    '/r/docs/initiatives/01-a.md': '---\nupdated: 2026-11-01\n---\n# A',
    '/r/docs/initiatives/02-b.md': '---\nupdated: 2026-10-01\n---\n# B',
  }
  return {
    reads,
    calls,
    call:
      over.call ??
      (async (tool, args) => {
        calls.push(args && Object.keys(args).length ? `${tool} ${JSON.stringify(args)}` : tool)
        if (tool === 'collections') return reply(COLLECTIONS)
        if (tool === 'list') return reply(listed(args))
        throw new Error(`unexpected ${tool}`)
      }),
    read:
      over.read ??
      (async path => {
        reads.push(path)
        const text = files[path]
        if (text === undefined) throw new Error(`ENOENT ${path}`)
        return text
      }),
  }
}

test('a call that rejects gives none, naming the server and the error', async () => {
  const load = await loadSnapshot(
    stubIo({
      call: async () => {
        throw new Error('server "brindley" is not connected')
      },
    }),
    [],
  )
  expect(load.kind).toBe('none')
  const reason = (load as { reason: string }).reason
  expect(reason).toContain('Brindley MCP server')
  expect(reason).toContain('server "brindley" is not connected')
})

test('an isError result gives none', async () => {
  const load = await loadSnapshot(
    stubIo({ call: async () => ({ content: [{ type: 'text', text: 'boom' }], isError: true }) }),
    [],
  )
  expect(load.kind).toBe('none')
  expect((load as { reason: string }).reason).toContain('boom')
})

test('no collections gives none', async () => {
  const load = await loadSnapshot(stubIo({ call: async () => reply([]) }), [])
  expect(load).toEqual({ kind: 'none', reason: 'No Brindley collections in this repository' })
})

test('all collections excluded gives none', async () => {
  const load = await loadSnapshot(stubIo(), ['**'])
  expect(load).toEqual({ kind: 'none', reason: 'No Brindley collections in this repository' })
})

test('the happy path drops excluded collections and reads updated from each file', async () => {
  const io = stubIo()
  const load = await loadSnapshot(io, ['**/test-corpus/**'])
  expect(load.kind).toBe('ok')
  if (load.kind !== 'ok') return
  expect(load.snapshot.checkout).toBe('/r')
  expect(load.snapshot.collections.map(c => c.name)).toEqual(['atlas'])
  expect(load.snapshot.initiatives.map(i => i.ref)).toEqual(['atlas#1', 'atlas#2'])
  expect(load.snapshot.initiatives.map(i => i.updated)).toEqual(['2026-11-01', '2026-10-01'])
  expect(load.snapshot.initiatives[0]?.displayRef).toBe('at#1')
  expect(io.reads.sort()).toEqual(['/r/docs/initiatives/01-a.md', '/r/docs/initiatives/02-b.md'])
  // Excluded collections are never listed.
  expect(io.calls).toEqual(['collections', 'list {"collection":"docs/initiatives"}'])
})

test('settled initiatives are neither read nor kept', async () => {
  const io = stubIo()
  const load = await loadSnapshot(io, ['**/test-corpus/**'])
  if (load.kind !== 'ok') throw new Error('expected ok')
  expect(load.snapshot.initiatives.map(i => i.ref)).toEqual(['atlas#1', 'atlas#2'])
  expect(io.reads).not.toContain('/r/docs/initiatives/03-c.md')
  expect(load.snapshot.collections[0]?.counts).toEqual({ designed: 1, draft: 1, done: 1 })
})

test('a file that cannot be read gives updated null and the load stays ok', async () => {
  const load = await loadSnapshot(
    stubIo({ files: { '/r/docs/initiatives/01-a.md': '---\nupdated: 2026-11-01\n---\n' } }),
    ['**/test-corpus/**'],
  )
  expect(load.kind).toBe('ok')
  if (load.kind !== 'ok') return
  expect(load.snapshot.initiatives.map(i => i.updated)).toEqual(['2026-11-01', null])
})

test('loadDetail reads the goal, updated, blockers and open questions from get', async () => {
  const args: unknown[] = []
  const io = stubIo({
    call: async (tool, a) => {
      args.push([tool, a])
      return {
        content: [
          {
            type: 'text',
            text:
              JSON.stringify({
                ref: 'atlas#1',
                openQuestions: 2,
                frontMatter: { updated: '2026-11-20' },
                dependencies: [
                  { ref: '2', classification: 'blocking', title: 'B', status: 'draft', path: 'x' },
                  { ref: 'beta#4', classification: 'satisfied' },
                  { ref: 'https://example.com', classification: 'external' },
                  { ref: '9', classification: 'missing' },
                ],
                body: '# A\n\n## Goal\n\nDo the thing.\nWell.\n\nMore.\n',
              }) + 'Checkout: /r (main)',
          },
        ],
      }
    },
  })
  const detail = await loadDetail(io, 'atlas#1')
  expect(args).toEqual([['get', { ref: 'atlas#1' }]])
  expect(detail).toEqual({
    ref: 'atlas#1',
    goal: 'Do the thing.\nWell.',
    updated: '2026-11-20',
    blockers: ['2', '9'],
    openQuestions: 2,
  })
})

test('a collection too large for one result is listed by status, and remembered', async () => {
  const calls: string[] = []
  const io = stubIo({
    call: async (tool, args = {}) => {
      calls.push(`${tool} ${JSON.stringify(args)}`)
      if (tool === 'collections') return reply(COLLECTIONS)
      if (tool === 'list' && args.status === undefined) return OVERSIZED
      return reply(listed(args))
    },
  })
  const split = new Set<string>()
  const load = await loadSnapshot(io, ['**/test-corpus/**'], split)
  expect(load.kind).toBe('ok')
  if (load.kind !== 'ok') return
  expect(load.snapshot.initiatives.map(i => i.ref).sort()).toEqual(['atlas#1', 'atlas#2'])
  // Settled initiatives are only counted, and Brindley's collections give the counts.
  expect(calls).toContain('list {"collection":"docs/initiatives","status":"draft"}')
  expect(calls).toContain('list {"collection":"docs/initiatives","status":"in-progress"}')
  expect(calls).not.toContain('list {"collection":"docs/initiatives","status":"done"}')
  expect([...split]).toEqual(['docs/initiatives'])

  calls.length = 0
  await loadSnapshot(io, ['**/test-corpus/**'], split)
  expect(calls).not.toContain('list {"collection":"docs/initiatives"}')
})

test('a status still too large for one result gives none, saying so', async () => {
  const io = stubIo({
    call: async (tool, args = {}) => {
      if (tool === 'collections') return reply(COLLECTIONS)
      if (tool === 'list' && (args.status === undefined || args.status === 'draft')) return OVERSIZED
      return reply(listed(args))
    },
  })
  const load = await loadSnapshot(io, ['**/test-corpus/**'], new Set())
  expect(load.kind).toBe('none')
  const reason = (load as { reason: string }).reason
  expect(reason).toContain('draft')
  expect(reason).toContain('docs/initiatives')
})
