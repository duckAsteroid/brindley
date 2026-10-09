// Spike (initiatives#31): replay the default branch's first-parent history of one collection.
// Throwaway: hard-wired to this repo's `initiatives/` collection.
import { execFileSync } from "node:child_process";
import { parse } from "yaml";
import { normaliseStatus } from "../../dist/model.js";

const git = (args) => execFileSync("git", args, { encoding: "utf8", maxBuffer: 1 << 28 });
const COLLECTION = "initiatives";
const FILE = new RegExp(`^${COLLECTION}/(?:([^/]+)/)?(\\d+)-[^/]+\\.md$`);

/** All the blobs at once through one `git cat-file --batch`, rather than a `git show` each. */
function readAll(specs) {
  const out = execFileSync("git", ["cat-file", "--batch"], { input: specs.join("\n") + "\n", maxBuffer: 1 << 28 });
  const texts = [];
  let at = 0;
  for (let k = 0; k < specs.length; k++) {
    const nl = out.indexOf(10, at);
    const size = Number(out.subarray(at, nl).toString().split(" ")[2]);
    texts.push(out.subarray(nl + 1, nl + 1 + size).toString("utf8"));
    at = nl + 1 + size + 1;
  }
  return texts;
}

function read(text, path) {
  const fm = /^---\n([\s\S]*?)\n---\n/.exec(text);
  let meta = {};
  try { meta = fm ? parse(fm[1]) ?? {} : {}; } catch {}
  const title = /^# (.+)$/m.exec(text)?.[1]?.trim() ?? path;
  const qs = /## Open questions\n([\s\S]*?)(\n## |$)/.exec(text)?.[1] ?? "";
  const open = (qs.match(/^- (?!~~)/gm) ?? []).filter(() => !/^_None/.test(qs.trim())).length;
  return { title, meta, open };
}

/** Every first-parent commit touching the collection, with the state of each initiative after it. */
export function replay() {
  const t0 = performance.now();
  const log = git(["log", "--first-parent", "--diff-merges=first-parent", "--reverse", "--format=@%H %cI %s", "--name-status", "--", COLLECTION]);
  const items = new Map(); // number -> { path, title, status, tags, open }
  const commits = [];
  const blocks = log.split("\n@").filter(Boolean).map((block) => {
    const [head, ...lines] = block.replace(/^@/, "").split("\n");
    const [sha, date, ...subject] = head.split(" ");
    const changed = new Set();
    for (const l of lines.filter(Boolean)) {
      const parts = l.split("\t");
      const kind = parts[0][0];
      const to = parts[2] ?? parts[1];
      if (kind !== "D" && FILE.test(to)) changed.add(to);
    }
    return { sha, date, subject, lines, changed: [...changed] };
  });
  const specs = blocks.flatMap((b) => b.changed.map((p) => `${b.sha}:${p}`));
  const texts = readAll(specs);
  let shows = 0;
  for (const { sha, date, subject, lines, changed } of blocks) {
    for (const l of lines.filter(Boolean)) {
      const parts = l.split("\t");
      const m = parts[0][0] === "D" && FILE.exec(parts[1]);
      if (m) items.delete(Number(m[2]));
    }
    for (const path of changed) {
      const m = FILE.exec(path);
      const n = Number(m[2]);
      const { title, meta, open } = read(texts[shows++], path);
      const status = normaliseStatus(String(meta.status ?? "")) ?? normaliseStatus(m[1] ?? "") ?? "draft";
      const tags = Array.isArray(meta.tags) ? meta.tags : [];
      items.set(n, { n, path, title: title.replace(/^\d+\s+/, ""), status, tags, open, type: meta.type ?? null, note: meta.status_note ?? null });
    }
    commits.push({ sha: sha.slice(0, 7), date, subject: subject.join(" "), items: structuredClone([...items.values()]) });
  }
  const tags = git(["for-each-ref", "--sort=creatordate", "--format=%(refname:short)", "refs/tags"]).split("\n").filter((t) => /^v\d+\.\d+\.\d+$/.test(t))
    .map((t) => ({ tag: t, date: git(["log", "-1", "--format=%cI", `${t}^{commit}`]).trim() }));
  return { commits, tags, shows, ms: performance.now() - t0 };
}
