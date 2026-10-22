---
type: feature
status: draft
updated: 2026-10-21
---
# Serve the progress report live over local HTTP

## Goal

The progress report can also be opened as a live page, served by the Brindley MCP server over HTTP on a local, randomly chosen port and rebuilt each time it is loaded, as well as written as a static file.

## Background

Today `report` writes a self-contained HTML file (`writeReport`, `src/report.ts:766`), which goes stale the moment the next commit lands. Building and rendering are already separate steps — `buildReport` (`src/report.ts:353`) produces the figures, `renderReport` turns them into the page — so a live page can call both per request and return the HTML instead of writing it. The MCP server runs over stdio (`src/cli.ts:76-77`); an HTTP listener in the same process must never write to stdout, which is the MCP channel.

The report's "now" is the latest commit time, not the clock (`src/report.ts:356-362`), which keeps the static file deterministic. A live page that keeps that rule only changes when commits land.

## Dependencies

_None._

## Related

- [30 One-page HTML progress dashboard](done/30-one-page-html-progress-dashboard.md)

## Decisions

- The static single-file report stays required and completely separate: `report` and `brindley report` keep writing the self-contained, script-free HTML file exactly as now, and nothing in this initiative changes it.
- The live page is rendered client-side from JSON: the server answers the page at once with a "calculating" state, the page fetches the report data as JSON (e.g. `/report.json`) while the git history is crawled, and draws the report when it arrives. The live page may use scripts.

## Open questions

- Does the live page draw the same report as the static file, by running the existing renderer (`renderReport`, `src/report-html.ts:427`) in the browser, or is it its own client-side page, free to look and behave differently (e.g. interactive filters)?
- Should the live page count uncommitted changes in the working tree (and so change on every save), or stay anchored on the latest commit like the static file, changing only when commits land?
- How does the HTTP server start: always alongside `serve`, only when a tool (e.g. `report_server`) is called and returns the URL, or from a separate CLI command such as `brindley report --serve` for use without an agent?
- Is the server only reachable from this machine (bound to `127.0.0.1`), or can it be opened to the network on request?
- Do the `report` tool's options (since, until, collection, palette, mode, branches, worktrees) become query parameters on the live page, e.g. `/?since=4w&collection=towpath`?
- Does an open page update itself when the repository changes (polling or server-sent events), or does the reader refresh it?
- How does the server stop: with the MCP session, on an idle timeout, or by a tool call?
- (implementation) Cache the built report by HEAD sha (plus options) so a refresh with nothing new is immediate?

## Acceptance criteria

_What must be true when this is done._
