---
layout: home

hero:
  name: Brindley
  text: Design fully before anyone digs.
  tagline: Plan work as Markdown in your git repo. Settle every open question with your AI agent, then hand it over to build — with an MCP server that keeps it all straight.
  image:
    src: /brindley-icon.svg
    alt: A design page above a canal lock, with a spade waiting
  actions:
    - theme: brand
      text: Get started
      link: /guide/getting-started
    - theme: alt
      text: How it works
      link: /guide/concepts
    - theme: alt
      text: Why "Brindley"?
      link: /story
    - theme: alt
      text: What's new
      link: /releases#whats-new

features:
  - icon: 📄
    title: Plans live with the code
    details: One Markdown file per initiative (ticket, issue — call it what you like), in any folder you mark as a collection. Versioned, branched and reviewed like code.
  - icon: 🔒
    title: Nothing moves, nothing breaks
    details: Status lives in front-matter, so files stay put and links never break. Existing completed/ and deferred/ folders are still understood.
  - icon: 💬
    title: Design in conversation
    details: A design-review prompt works through open questions one at a time, in open chat, grounded in your actual code — and records each decision as it goes.
  - icon: 🚦
    title: Knows what's ready
    details: Dependencies are the links in each initiative's Dependencies section. Brindley works out what's blocked, what's ready, and in what order — across collections.
  - icon: 🛠️
    title: Hand it to an agent
    details: An implement brief that starts by checking the work is really ready, and finishes by requiring the project docs to describe what is now true.
  - icon: 🔭
    title: Spikes that measure
    details: Build just enough to measure what matters, record the findings, and keep the code — it may become the real implementation.
---

## A taste

```markdown
---
type: feature
status: designed
tags: [notifications]
---
# Opening-hours change impact

## Dependencies

- [23 Passage recorded event](23-passage-recorded-event.md) — captains are notified from it.

## Open questions

- (implementation) One shared filter contract, or per-endpoint filters?

## Acceptance criteria

- Captains with a booked slot are told when a lock's opening hours change.
```

Ask your agent *"what's ready?"*, *"let's work through the open questions on sb#22"*, or
*"implement sb#21"* — Brindley's tools do the bookkeeping, and every collection's README keeps a
current table and dependency graph.
