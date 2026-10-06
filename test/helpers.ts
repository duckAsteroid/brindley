import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { loadRoot } from "../src/repo.js";
import type { Root } from "../src/model.js";

process.env["BRINDLEY_TODAY"] = "2026-10-06";
process.env["GIT_AUTHOR_NAME"] = "Test";
process.env["GIT_AUTHOR_EMAIL"] = "test@example.com";
process.env["GIT_COMMITTER_NAME"] = "Test";
process.env["GIT_COMMITTER_EMAIL"] = "test@example.com";

export function git(dir: string, ...args: string[]): string {
  return execFileSync("git", args, { cwd: dir, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
}

export function write(dir: string, rel: string, text: string): void {
  const p = join(dir, rel);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, text);
}

export interface Fixture {
  repo: string;
  load: () => Root;
  cleanup: () => void;
}

/** A git repo containing the lock slot-booking example collection. */
export function fixture(opts: { files?: Record<string, string>; commit?: boolean } = {}): Fixture {
  const repo = mkdtempSync(join(tmpdir(), "brindley-"));
  git(repo, "init", "-q", "-b", "main");
  for (const [rel, text] of Object.entries(opts.files ?? {})) write(repo, rel, text);
  if (opts.commit !== false) {
    git(repo, "add", "-A");
    git(repo, "commit", "-q", "--allow-empty", "-m", "fixture");
  }
  return {
    repo,
    load: () => loadRoot(repo),
    cleanup: () => rmSync(repo, { recursive: true, force: true }),
  };
}

export const C = "docs/initiatives/LOCK-42/slot-booking";
export const N = "slot-booking";

export const lockExample: Record<string, string> = {
  [`${C}/README.md`]: `---
brindley: 1
title: LOCK-42 lock slot booking
status: active
docs: ["services/**/docs/*.md"]
types: [feature, bug, refactor, perf, docs, chore, spike]
tags:
  notifications: Telling captains about changes to their slots
---
# LOCK-42 lock slot booking

Captains book slots to take boats up or down through the lock.
`,
  [`${C}/19-boat-identity.md`]: `---
type: feature
status: done
docs_impact: "none: fixture"
updated: 2026-09-01
---
# Boat identity
`,
  [`${C}/20-slot-calendar-and-read-model.md`]: `---
type: feature
status: done
docs_impact: "none: fixture"
updated: 2026-09-10
---
# Slot calendar and read model
`,
  [`${C}/21-lock-sensor-import.md`]: `---
type: feature
status: designed
updated: 2026-09-24
---
# Lock sensor CSV import

## Goal

Import lock sensor readings. See the [design notes](21-sensor-readings/notes.md).

## Dependencies

- [19 Boat identity](19-boat-identity.md) — readings are keyed by boat.
- [20 Slot calendar](20-slot-calendar-and-read-model.md) and the [sensor spec](21-sensor-readings/notes.md).
- [geo-coords library](https://example.com/libs/geo-coords) for lock positions.

## Acceptance criteria

- Readings are imported.
`,
  [`${C}/22-opening-hours-change-impact.md`]: `---
type: feature
status: draft
tags: [notifications]
---
# Opening-hours change impact

## Dependencies

Needs [the passage event](23-passage-recorded-event.md) to notify captains.

## Related

- [19 Boat identity](19-boat-identity.md)

## Agreed direction

Validate synchronously.

## Open questions

- Must captains with a booked slot be re-notified when a lock's opening hours change, or is
  updating the published timetable enough?
- Should an ascending and a descending slot be paired, so the descending boat uses the water level
  the ascending boat leaves behind?
- (implementation) One shared filter contract, or per-endpoint typed filters?

## Acceptance criteria

- Affected captains are identified.
`,
  [`${C}/21-sensor-readings/notes.md`]: "# Sensor notes\n",
  [`${C}/23-passage-recorded-event.md`]: `---
type: feature
status: designed
---
# Passage recorded event
`,
};
