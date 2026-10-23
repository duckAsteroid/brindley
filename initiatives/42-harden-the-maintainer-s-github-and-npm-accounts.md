---
type: chore
status: draft
tags: [security]
updated: 2026-10-23
---
# Harden the maintainer's GitHub and npm accounts

## Goal

The credentials that can release Brindley are phishing-resistant and narrowly scoped.

## Background

Whoever can push a tag can release. On the maintainer's machine the `gh` CLI's active login has a classic token with `repo` and `workflow` scopes — enough to push tags, edit workflows and, as owner, change repo settings — held in the system keyring, where any process running as that user can ask `gh` for it, including a malicious dependency in an unrelated project. The npm account can publish directly unless tokens are disallowed ([Publish to npm only through trusted publishing](37-publish-to-npm-only-through-trusted-publishing.md)).

## Design

- Passkey or hardware-key 2FA on the GitHub and npm accounts; remove SMS fallback.
- Replace the `gh` CLI's classic token with a fine-grained PAT limited to the repos worked on from
  that machine, with only the permissions used day to day.
- Review and revoke unused classic PATs, OAuth apps and SSH keys on the GitHub account, and unused
  tokens on the npm account.

## Dependencies

_None._

## Open questions

- Should the day-to-day token lack `workflow`/admin rights entirely, with a separate, short-lived
  token (or the web UI) used for releases and settings changes?

## Acceptance criteria

- GitHub and npm accounts use passkey or hardware-key 2FA.
- The `gh` CLI on the maintainer's machine uses a fine-grained token; `gh auth status` no longer
  shows classic `repo` scope.
- No unused tokens, apps or keys remain on either account.
