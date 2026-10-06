# Themes

Some ideas don't belong to one initiative — they run through several, across collections. Tag
the initiatives, and optionally give the theme an overview document.

## Tags

```yaml
tags: [notifications, accessibility]
```

Tags are lowercase kebab-case. A collection can declare the tags it expects, with descriptions,
so typos are caught:

```yaml
# collection README front-matter
tags:
  notifications: Telling captains about changes to their slots
```

## Theme overview docs

A non-numbered Markdown file in a collection folder becomes the theme's overview when its
front-matter names the tag:

```yaml
---
theme: notifications
summary: How captains hear about changes
---
# Notifications — orientation map
```

Brindley then:

- keeps a generated list in the doc of every initiative tagged `notifications`, in any
  collection, with status and readiness — your prose is left alone;
- points to the doc from `get`, `tags`, the overview and the briefs, so an agent working on a
  tagged initiative reads it first.

Ask *"show me everything in the notifications theme"* to get the overview plus every member as
one document.
