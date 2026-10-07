import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { createMarkdownRenderer, defineLoader, type SiteConfig } from "vitepress";

export interface Release {
  version: string;
  date: string;
  highlights: string | null;
  /** The release notes (highlights, then details), rendered — the same Markdown as the GitHub Release. */
  html: string;
}

declare const data: Release[];
export { data };

// Read from git at build time; nothing generated is committed.
export default defineLoader({
  async load(): Promise<Release[]> {
    const config = (globalThis as { VITEPRESS_CONFIG?: SiteConfig }).VITEPRESS_CONFIG!;
    const md = await createMarkdownRenderer(config.srcDir, config.markdown, config.site.base, config.logger);
    // Imported at run time rather than bundled: the script is also a runnable CLI (with a shebang).
    const script = pathToFileURL(resolve(config.srcDir, "../scripts/changelog.mjs")).href;
    const { releaseMarkdown, releases } = await import(/* @vite-ignore */ script);
    return releases().map((r: { version: string; date: string; highlights: string | null }) => ({
      version: r.version,
      date: r.date,
      highlights: r.highlights,
      html: md.render(releaseMarkdown(r)),
    }));
  },
});
