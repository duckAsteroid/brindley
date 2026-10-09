#!/usr/bin/env node
// Build a throwaway repository with a made-up history for the canal example collection
// (lock-gate-maintenance), then write progress reports from it for the docs site.
//
//   node scripts/canal-history.mjs [<out-dir>]     (default: site/public/examples; needs `npm run build`)
//
// Every date, author and change is scripted, so the reports come out the same on every run.
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const cli = resolve(here, "../dist/cli.js");
const out = resolve(process.argv[2] ?? join(here, "../site/public/examples"));
// A fixed folder name: the report is titled after it.
const scratch = mkdtempSync(join(tmpdir(), "brindley-canal-"));
const repo = join(scratch, "canal");
mkdirSync(repo);
const C = "lock-gate-maintenance";
const START = Date.UTC(2026, 2, 2, 9); // Monday 2 March 2026
const env = (day) => ({
  ...process.env,
  GIT_AUTHOR_NAME: "Canal Team",
  GIT_AUTHOR_EMAIL: "team@canal.example",
  GIT_COMMITTER_NAME: "Canal Team",
  GIT_COMMITTER_EMAIL: "team@canal.example",
  GIT_AUTHOR_DATE: new Date(START + day * 864e5).toISOString(),
  GIT_COMMITTER_DATE: new Date(START + day * 864e5).toISOString(),
});
const git = (args, day = 0) => execFileSync("git", args, { cwd: repo, env: env(day), stdio: ["ignore", "pipe", "pipe"] });
const write = (rel, text) => {
  mkdirSync(dirname(join(repo, rel)), { recursive: true });
  writeFileSync(join(repo, rel), text);
};

const README = `---
brindley: 1
title: Lock gate maintenance
summary: Keeping the flight of locks working, and letting captains book their passage.
dimensions:
  size: [1, 2, 3, 5, 8]
tags:
  gates: Gates, beams and the structures that hold the water
  paddles: Paddles and the gear that moves them
  booking: Booking passage through the locks
  sensors: Measuring water levels along the flight
---
# Lock gate maintenance
`;

/** The work items: number, slug, title, size (null: unsized), tags. */
const ITEMS = {
  1: ["gate-repairs-at-lock-7", "Gate repairs at lock 7", 5, ["gates"]],
  2: ["replace-bottom-paddles", "Replace the bottom paddles", 8, ["paddles"]],
  3: ["slot-booking-calendar", "Slot booking calendar", 5, ["booking"]],
  4: ["captain-notifications", "Captain notifications", 3, ["booking"]],
  5: ["lock-sensor-import", "Lock sensor import", 8, ["sensors"]],
  6: ["winter-stoppage-plan", "Winter stoppage plan", 2, ["gates"]],
  7: ["balance-beam-refurbishment", "Balance beam refurbishment", 3, ["gates"]],
  8: ["booking-cancellations", "Booking cancellations", 2, ["booking"]],
  9: ["water-level-alerts", "Water level alerts", null, ["sensors"]],
  10: ["towpath-signage", "Towpath signage", null, []],
  11: ["paddle-gear-lubrication-schedule", "Paddle gear lubrication schedule", 1, ["paddles"]],
  12: ["online-slot-payments", "Online slot payments", 8, ["booking"]],
  13: ["night-navigation-lights", "Night navigation lights", 5, ["gates"]],
  14: ["sensor-dashboard-for-lock-keepers", "Sensor dashboard for lock keepers", null, ["sensors"]],
};

const set = (n, status, extra = {}) => {
  const [slug, title, size, tags] = ITEMS[n];
  const fm = [`type: feature`, `status: ${status}`];
  if (size !== null) fm.push(`size: ${size}`);
  if (tags.length) fm.push(`tags: [${tags.join(", ")}]`);
  if (status === "done") fm.push(`docs_impact: "none: example"`);
  for (const [k, v] of Object.entries(extra)) fm.push(`${k}: ${JSON.stringify(v)}`);
  write(`${C}/${String(n).padStart(2, "0")}-${slug}.md`, `---\n${fm.join("\n")}\n---\n# ${title}\n\n## Goal\n\n${title}.\n`);
};

/** The story, a day number per step: [day, message, changes, tag?]. */
const STORY = [
  [0, "Plan the first lock works", () => { write(`${C}/README.md`, README); [1, 2, 3, 4, 5, 6, 7].forEach((n) => set(n, "draft")); }],
  [6, "Design gate repairs and the booking calendar", () => { set(1, "designed"); set(3, "designed"); }],
  [10, "Start gate repairs", () => set(1, "in-progress")],
  [17, "Start the booking calendar", () => set(3, "in-progress")],
  [24, "Gate repairs done", () => set(1, "done")],
  [31, "Booking cancellations planned", () => set(8, "draft"), "v1.0.0"],
  [38, "Slot booking calendar done", () => set(3, "done")],
  [45, "Design notifications and the stoppage plan", () => { set(4, "designed"); set(6, "designed"); }],
  [52, "Water level alerts and towpath signage added", () => { set(9, "draft"); set(10, "draft"); set(4, "in-progress"); }],
  [59, "Winter stoppage plan done", () => set(6, "done")],
  [66, "Captain notifications done", () => set(4, "done"), "v1.1.0"],
  [73, "Online slot payments planned", () => { set(12, "draft"); set(11, "designed"); }],
  [80, "Start paddle replacement", () => { set(2, "designed"); set(2, "in-progress"); }],
  [87, "Lubrication schedule done", () => set(11, "done")],
  [94, "Drop online payments", () => set(12, "abandoned", { status_note: "Lock keepers take payment on the day. A card reader at each lock was cheaper." })],
  [101, "Night lights planned, then parked", () => { set(13, "deferred", { status_note: "Waiting for the winter stoppage. The flight closes in November." }); set(8, "designed"); }, "v1.2.0"],
  [108, "Bottom paddles replaced", () => set(2, "done")],
  [115, "Start the balance beams and cancellations", () => { set(7, "in-progress"); set(8, "in-progress"); }],
  [122, "Sensor import designed; dashboard added", () => { set(5, "designed"); set(14, "draft"); }],
  [129, "Booking cancellations done", () => set(8, "done"), "v1.3.0"],
  [136, "Start the sensor import", () => set(5, "in-progress")],
  [143, "Water level alerts designed", () => set(9, "designed")],
  [150, "Balance beams done", () => set(7, "done")],
  [157, "Signage designed", () => set(10, "designed"), "v1.4.0"],
  [164, "Sensor import done", () => set(5, "done")],
];

try {
  git(["init", "-q", "-b", "main"]);
  for (const [day, message, change, tag] of STORY) {
    change();
    git(["add", "-A"], day);
    git(["commit", "-q", "-m", message], day);
    if (tag) git(["tag", "-a", tag, "-m", tag], day);
  }
  mkdirSync(out, { recursive: true });
  const palette = join(repo, "towpath-green.json");
  writeFileSync(
    palette,
    JSON.stringify({ light: { not_started: "#b2ddb5", in_progress: "#46a758", complete: "#203c25" }, dark: { not_started: "#2d5736", in_progress: "#46a758", complete: "#94ce9a" } }, null, 2),
  );
  const run = (file, ...args) => {
    execFileSync("node", [cli, "report", "--out", join(out, file), ...args], { cwd: repo, stdio: ["ignore", "pipe", "inherit"] });
    console.log(`wrote ${join(out, file)}`);
  };
  run("canal-progress.html");
  run("canal-since-v1.2.0-forest.html", "--since", "v1.2.0", "--palette", "forest");
  run("canal-own-palette.html", "--palette", palette, "--mode", "dark");
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
