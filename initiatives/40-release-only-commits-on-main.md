---
type: chore
status: draft
tags: [security]
updated: 2026-10-23
---
# Release only commits on main

## Goal

The release workflow refuses to publish a tag that points at a commit not reachable from `main`.

## Background

`release.yml` checks that the computed version matches the tag (`.github/workflows/release.yml:35-43`) but not where the tagged commit came from. A tag on a commit pushed only to a side branch publishes just as a tag on `main` does, so a malicious change never has to appear on `main`.

## Design

A step after checkout, before `npm ci`:

```sh
git fetch origin main
git merge-base --is-ancestor "$GITHUB_SHA" origin/main \
  || { echo "::error::$GITHUB_REF_NAME is not on main"; exit 1; }
```

Placed before `npm ci` so no dependency install script runs for a refused tag.

## Dependencies

_None._

## Related

- [Protect release tags and main](38-protect-release-tags-and-main.md) — this check is only as strong as `main`'s protection

## Open questions

_None._

## Acceptance criteria

- A tag on a commit not on `main` fails the release before `npm ci`, with an error naming the tag.
- A tag on `main` releases as before.
