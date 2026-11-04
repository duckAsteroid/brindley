---
type: bug
status: draft
updated: 2026-11-03
---
# Return tool results as structured content

## Goal

A client that calls Brindley's tools from code, rather than reading their text, gets the result as
an object. Today this script returns `{}`:

```js
const g = await tools.brindley.get({ ref: "ese#137" });
return { status: g.status, acceptanceCriteria: g.acceptanceCriteria, dependants: g.dependants };
```

## Background

Every tool replies with two text blocks and nothing else (`src/server.ts:371-376`, `reply`): the
result as pretty-printed JSON, then a `Checkout: …` line naming the worktree. No tool declares an
`outputSchema` or returns `structuredContent`, so a code-mode wrapper has no object to hand back.
Each field the script reads is `undefined`, and `JSON.stringify` drops them all. Parsing the text
doesn't work either if a client joins the blocks: the checkout line after the JSON breaks it.

The MCP SDK in use (`@modelcontextprotocol/sdk` 1.32.1) supports both. `structuredContent` may be
returned without an `outputSchema`; the SDK only validates it when a schema is declared. Clients
that read text keep the text blocks.

`structuredContent` must be a JSON object, but some tools return arrays (`list`, `ready`,
`questions`, …), and write tools return an `OpResult` (`result`, `touched`, `warnings`, …) that the
handler unpacks before replying.

## Dependencies

_None._

## Related

- [44 A JSON snapshot that every view renders from](44-a-json-snapshot-that-every-view-renders-from.md) — another machine-readable view of the same data; a schema for one could serve both

## Open questions

- **Q1** How are array results carried: wrapped as `{ items: [...] }` in `structuredContent`
  only, wrapped the same way in the text too so the two match, or left without structured content?
- **Q2** Does the checkout line go into the structured result (e.g. a `checkout` field), or stay
  text only?
- **Q3** For write tools, is the structured result the whole `OpResult` (`result`, `touched`,
  `warnings`, `milestones`) or just what the text shows today?
- **Q4** Does each tool declare an `outputSchema` (zod, so code-mode clients get types and results
  are validated), or is `structuredContent` returned without schemas, at least at first?
- **Q5** Is the change breaking for semver: does anything rely on the reply having exactly two text
  blocks?

## Acceptance criteria

- Calling `get` through an MCP client returns `structuredContent` with the same fields as the JSON
  text (`status`, `acceptanceCriteria`, `dependants`, `related`, …).
- Every tool that returns JSON also returns `structuredContent`, including tools whose result is an
  array and write tools.
- Errors still return `isError` with a text message.
- Clients that read only text see the same text as before.
- MCP-SERVER.md and the site's MCP reference describe the structured results.
