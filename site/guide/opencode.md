# OpenCode

OpenCode runs Brindley as a local MCP server from npm; `brindley@latest` fetches the newest release
on first use. Add it to `~/.config/opencode/opencode.jsonc` to use it in every repo:

```jsonc
// ~/.config/opencode/opencode.jsonc
{
  "mcp": {
    "brindley": {
      "type": "local",
      "command": ["npx", "-y", "brindley@latest"],
      "cwd": ".",
      "timeout": 30000,
      "enabled": true
    }
  }
}
```

- `cwd: "."` starts the server in the directory OpenCode was opened in; it works on that git
  repository.
- `timeout` allows for `npx` downloading the package on first start.

Check the connection with:

```sh
opencode mcp list
```

The workflows (design review, implement, spike, triage) are the server's MCP prompts; the `brief`
tool returns the same text for agents that can't fetch prompts. See
[MCP tools & prompts](/reference/mcp).
