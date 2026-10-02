# Desktop Commander MCP

Saved: 2026-10-01

## Primary links

- Canonical repository: https://github.com/wonderwhy-er/DesktopCommanderMCP
- Project site: https://desktopcommander.app
- MCP package: @wonderwhy-er/desktop-commander
- MCP registry name: io.github.wonderwhy-er/desktop-commander

## What it is

Desktop Commander is an MCP server that gives an MCP-compatible AI client controlled access to a machine's terminal, filesystem, file search/editing, and process management.

The current project supports local stdio MCP use as well as a remote-device mode intended for web clients such as ChatGPT and Claude, while commands still execute on the user's own machine.

## Why this is useful

- Run shell and terminal commands through an MCP-capable assistant.
- Read, search, create, and edit local files.
- Start, inspect, and manage processes and long-running commands.
- Work with code and documents from one AI conversation.
- Connect web-hosted AI clients to an authorized computer through Desktop Commander's remote mode.
- Avoid putting SSH passwords or server credentials directly into prompts when a controlled MCP machine connection is the better interface.

## Current install pattern

Standard MCP configuration:

```json
{
  "mcpServers": {
    "desktop-commander": {
      "command": "npx",
      "args": ["-y", "@wonderwhy-er/desktop-commander@latest"]
    }
  }
}
```

Codex:

```bash
codex mcp add desktop-commander -- npx -y @wonderwhy-er/desktop-commander@latest
```

Claude Code:

```bash
claude mcp add --scope user desktop-commander -- npx -y @wonderwhy-er/desktop-commander@latest
```

Remote device mode:

```bash
npx @wonderwhy-er/desktop-commander@latest remote
```

The remote MCP endpoint documented by the project is:

```text
https://mcp.desktopcommander.app
```

Complete the project's browser authentication flow before trusting a remote client with machine access.

## Security guidance

Desktop Commander is powerful because it can execute commands and alter files. Treat access to it like access to the underlying machine.

- Use it only on machines you control.
- Keep OS permissions and service accounts least-privileged.
- Do not place passwords, API keys, private keys, or tokens in repository files.
- Prefer secrets managers, environment injection, or platform-native secret stores.
- Review destructive commands before execution when the target machine contains production state.
- Keep production deployment authority separate from a general-purpose developer workstation unless explicitly intended.

## Potential Caroline use

Desktop Commander is a strong operator/developer interface for Caroline infrastructure work. It can give an authorized coding assistant direct access to a controlled workstation or server for repository work, CLI operations, diagnostics, file editing, deployment tooling, and SSH-based maintenance.

For Caroline specifically, it should be treated as an operations surface rather than a production runtime dependency. Production secrets and authoritative configuration should remain in their existing systems.

## Relationship to OpenCode

Desktop Commander and OpenCode are complementary:

- **OpenCode** provides the coding-agent environment and can use models available through GitHub Copilot.
- **Desktop Commander** provides machine-level MCP capabilities such as terminal, filesystem, and process access.

Together, they can form a substantially more capable development/operator workflow, provided machine permissions and production boundaries are kept explicit.
