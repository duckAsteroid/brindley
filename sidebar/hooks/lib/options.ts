// The mod's userConfig, with defaults for anything missing or invalid.

import type { Order } from './model'

export type Options = { order: Order; exclude: string[]; maxRows: number; server: string }

const ORDERS: readonly string[] = ['status-recency', 'status-priority', 'recency', 'priority']

export const DEFAULT_OPTIONS: Options = {
  order: 'status-recency',
  exclude: ['**/test-corpus/**'],
  maxRows: 8,
  server: 'plugin:brindley:core',
}

export function resolveOptions(raw: unknown): Options {
  const o = raw !== null && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  const order = typeof o.order === 'string' && ORDERS.includes(o.order) ? (o.order as Order) : DEFAULT_OPTIONS.order
  const exclude = Array.isArray(o.exclude)
    ? o.exclude.filter((v): v is string => typeof v === 'string')
    : [...DEFAULT_OPTIONS.exclude]
  const maxRows =
    typeof o.maxRows === 'number' && Number.isFinite(o.maxRows) && o.maxRows >= 1
      ? Math.floor(o.maxRows)
      : DEFAULT_OPTIONS.maxRows
  const server = typeof o.server === 'string' && o.server.trim() ? o.server.trim() : DEFAULT_OPTIONS.server
  return { order, exclude, maxRows, server }
}
