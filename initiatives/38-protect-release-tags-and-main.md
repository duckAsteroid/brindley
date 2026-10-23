---
type: chore
status: draft
tags: [security]
updated: 2026-10-23
---
# Protect release tags and main

## Goal

Only the repo owner can create, move or delete `v*` tags, and `main` cannot be force-pushed or deleted.

## Background

Pushing a `v*.*.*` tag is the whole release trigger (`.github/workflows/release.yml:5-7`). The repo has no rulesets and `main` has no branch protection, so any token with push access can create a release tag, move an existing one, or rewrite `main`.

## Design

- A tag ruleset on `refs/tags/v*`: restrict creation, update and deletion, with only the repo
  admin role in the bypass list.
- A branch ruleset on `main`: block force pushes and deletion. Pull requests are not required —
  Brindley has one maintainer who commits to `main` directly.

## Dependencies

_None._

## Related

- [Release only commits on main](40-release-only-commits-on-main.md) — makes a protected `main` the only source of releases

## Open questions

- Should the tag ruleset also require signed tags (and `main` signed commits)? It raises the cost of
  a stolen push token, which can't sign, but means setting up commit/tag signing on every machine
  that releases.

## Acceptance criteria

- `gh api repos/duckAsteroid/brindley/rulesets` lists a tag ruleset for `v*` and a branch ruleset
  for `main` as described.
- Pushing a `v*` tag as a non-bypass actor, and force-pushing `main`, are both rejected.
