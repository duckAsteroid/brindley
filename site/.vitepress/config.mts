import { defineConfig } from "vitepress";

export default defineConfig({
  title: "Brindley",
  description: "Design fully before anyone digs — planned work as Markdown in git, with an MCP server for AI agents.",
  base: "/brindley/",
  cleanUrls: true,
  lastUpdated: true,
  head: [
    ["link", { rel: "icon", type: "image/svg+xml", href: "/brindley/brindley-icon.svg" }],
    ["meta", { name: "theme-color", content: "#12343b" }],
  ],
  themeConfig: {
    logo: "/brindley-icon.svg",
    siteTitle: "Brindley",
    nav: [
      { text: "Guide", link: "/guide/getting-started" },
      { text: "Reference", link: "/reference/front-matter" },
      { text: "Releases", link: "/releases" },
      { text: "Progress", link: "/progress.html", target: "_self" },
      { text: "Why Brindley?", link: "/story" },
    ],
    sidebar: [
      {
        text: "Guide",
        items: [
          { text: "Getting started", link: "/guide/getting-started" },
          { text: "Concepts", link: "/guide/concepts" },
          { text: "The workflow", link: "/guide/workflow" },
          { text: "Spikes", link: "/guide/spikes" },
          { text: "Themes", link: "/guide/themes" },
          { text: "Reporting progress", link: "/guide/reporting" },
          { text: "Adopting an existing folder", link: "/guide/adopting" },
        ],
      },
      {
        text: "Reference",
        items: [
          { text: "Front-matter", link: "/reference/front-matter" },
          { text: "Statuses", link: "/reference/statuses" },
          { text: "Types", link: "/reference/types" },
          { text: "MCP tools & prompts", link: "/reference/mcp" },
          { text: "CLI", link: "/reference/cli" },
          { text: "Validation rules", link: "/reference/validation" },
        ],
      },
      {
        text: "More",
        items: [
          { text: "Releases", link: "/releases" },
          { text: "Why Brindley?", link: "/story" },
          { text: "Format specification", link: "https://github.com/duckAsteroid/brindley/blob/main/FORMAT.md" },
          { text: "Server design", link: "https://github.com/duckAsteroid/brindley/blob/main/MCP-SERVER.md" },
        ],
      },
    ],
    socialLinks: [{ icon: "github", link: "https://github.com/duckAsteroid/brindley" }],
    search: { provider: "local" },
    editLink: {
      pattern: "https://github.com/duckAsteroid/brindley/edit/main/site/:path",
      text: "Edit this page on GitHub",
    },
    footer: {
      message: "MIT licensed · Named after James Brindley, engineer of the Bridgewater Canal",
      copyright: "© 2026 Chris Senior",
    },
  },
});
