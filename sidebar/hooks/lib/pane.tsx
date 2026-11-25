// The pane's two views: the list (counts, Pick up next) and one initiative's detail.

import type { EngineInterface, RenderInput } from 'claude-code'

import type { Initiative, Load, PaneView } from '../../types'
import { glyphFor, rowsFor, summarise, typeMark } from './model'
import type { Options } from './options'
import { truncate } from './text'

/** What the pane draws from: the mod's $.state values, read by the render hook. */
export type PaneState = { load: Load | null; view: PaneView; expanded: boolean }

export type PaneActions = {
  toggle(): void
  open(ref: string): void
  back(): void
  queue(i: Initiative): void
  copy(i: Initiative): void
}

type PaneInput = RenderInput<'Pane'>

const GLYPH_COLOR: Record<ReturnType<typeof glyphFor>, string | undefined> = {
  '▶': 'success',
  '◆': 'warning',
  '○': undefined,
  '?': 'error',
}

/** The detail view goes back to the list when its initiative is no longer loaded. */
export function reconcileView(view: PaneView, load: Load | null): PaneView {
  if (view.mode === 'list') return view
  if (load?.kind !== 'ok') return { mode: 'list' }
  return load.snapshot.initiatives.some(i => i.ref === view.ref) ? view : { mode: 'list' }
}

export const countsLine = (c: ReturnType<typeof summarise>): string =>
  `${c.active} active, ${c.draft} draft · ${c.deferred} deferred, ${c.done} done`

export function renderPane(
  $: EngineInterface,
  e: PaneInput,
  { load, view, expanded }: PaneState,
  options: Options,
  actions: PaneActions,
) {
  const { Box, Text, Button } = $.ui.resolve(e)
  const columns = Math.max(8, e.props.bodyColumns)

  if (load === null) return <Text dimColor>Loading initiatives…</Text>
  if (load.kind === 'none') return <Text dimColor>{load.reason}</Text>

  const initiatives = load.snapshot.initiatives
  const shown = view.mode === 'detail' ? initiatives.find(i => i.ref === view.ref) : undefined

  if (view.mode === 'detail' && shown) {
    const detail = view.detail
    const blockers = detail?.blockers ?? shown.blockedBy
    const questions = detail?.openQuestions ?? shown.openQuestions
    const updated = detail?.updated ?? shown.updated
    return (
      <Box flexDirection="column">
        <Text bold>{`${shown.displayRef} ${shown.title}`}</Text>
        <Text dimColor>{`${shown.status ?? '?'} · ${shown.type ?? 'no type'} · ${updated ?? 'not dated'}`}</Text>
        <Text> </Text>
        {detail === null ? <Text dimColor>Loading…</Text> : <Text>{detail.goal || 'No goal written.'}</Text>}
        <Text> </Text>
        {blockers.length > 0 && <Text color="error">{`Blocked by: ${blockers.join(', ')}`}</Text>}
        <Text dimColor>{questions === 1 ? '1 open question' : `${questions} open questions`}</Text>
        <Text> </Text>
        <Box flexDirection="row" gap={1}>
          <Button key="queue" variant="primary" onPress={() => actions.queue(shown)}>
            Queue
          </Button>
          <Button key="copy" onPress={() => actions.copy(shown)}>
            Copy
          </Button>
          <Button key="back" onPress={() => actions.back()}>
            Back
          </Button>
        </Box>
      </Box>
    )
  }

  const counts = summarise(load.snapshot.collections, initiatives)
  const rows = rowsFor(initiatives, options.order, options.maxRows, expanded)
  const count = expanded ? `${counts.active} · ${counts.draft}` : `${counts.active}`

  return (
    <Box flexDirection="column">
      <Text dimColor>{countsLine(counts)}</Text>
      <Text> </Text>
      <Button key="toggle" plain onPress={() => actions.toggle()}>
        {`${expanded ? '▼' : '▶'} Pick up next `}
        <Text dimColor>{count}</Text>
      </Button>
      {rows.length === 0 && <Text dimColor>Nothing to pick up.</Text>}
      {rows.map(i => {
        const glyph = glyphFor(i)
        const blocked = i.blockedBy.length > 0
        const room = columns - 4 - (blocked ? 2 : 0)
        return (
          <Button key={`row:${i.ref}`} plain onPress={() => actions.open(i.ref)}>
            <Text color={GLYPH_COLOR[glyph]} dimColor={glyph === '○'}>
              {glyph}
            </Text>
            {` ${typeMark(i.type)} `}
            <Text wrap="truncate">{truncate(`${i.displayRef} ${i.title}`, room)}</Text>
            {blocked && <Text dimColor> ⊘</Text>}
          </Button>
        )
      })}
    </Box>
  )
}
