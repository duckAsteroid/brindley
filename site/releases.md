---
outline: false
---

<script setup>
import { data as releases } from "./releases.data.mts";
const [latest, ...earlier] = releases;
</script>

# Releases

Generated from the release tags and their commits: features, fixes, performance changes and
breaking changes. Each release is on [npm](https://www.npmjs.com/package/brindley) and
[GitHub](https://github.com/duckAsteroid/brindley/releases).

<template v-if="latest">

## What's new in {{ latest.version }} {#whats-new}

<p class="release-date">{{ latest.date }}</p>
<div v-html="latest.html"></div>

## Earlier releases {#earlier}

<template v-for="r in earlier" :key="r.version">
  <h3 :id="'v' + r.version">{{ r.version }} <span class="release-date">— {{ r.date }}</span></h3>
  <div v-html="r.html"></div>
</template>

</template>
<p v-else>No releases yet.</p>

<style>
.release-date { color: var(--vp-c-text-2); font-size: 0.9em; font-weight: normal; }
</style>
