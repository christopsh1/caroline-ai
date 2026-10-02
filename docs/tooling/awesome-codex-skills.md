# Awesome Codex Skills

Saved: 2026-10-01

## Primary link

- Repository: https://github.com/composio-community/awesome-codex-skills

## What it is

A community-maintained collection of reusable Codex skills and skill patterns. A skill packages procedural instructions in a `SKILL.md` file and can optionally include scripts, references, and assets.

The main value is progressive disclosure: instead of putting every workflow into one giant agent prompt, the runtime can load a focused skill only when that class of work is needed.

## Why this is useful for Caroline

This repository is best treated as a pattern and source library for building first-party Caroline skills rather than as a production dependency that is installed wholesale.

Good Caroline candidates include:

- `caroline-mcp-builder`
- `caroline-codebase-recon`
- `caroline-codebase-migrate`
- `caroline-phone-debugger`
- `caroline-cloudflare-deployment`
- `caroline-neon-migration`
- `caroline-llm-router`
- `caroline-release-verification`

## Skills worth inspecting first

The upstream repository includes several especially relevant patterns:

- `skill-creator` — framework for designing and packaging new skills.
- `mcp-builder` — MCP server construction and evaluation workflow.
- `codebase-recon` — repository reconnaissance before making changes.
- `codebase-migrate` — controlled multi-file migration workflow.
- `gh-fix-ci` — GitHub Actions / CI diagnosis and repair.
- `pr-review-ci-fix` — review-to-fix-to-CI workflow.
- `webapp-testing` — browser-level application verification.

## Recommended Caroline architecture

```text
Caroline
├── Policy / authorization
├── Tool registry
│   └── MCP capabilities
├── Skill registry
│   ├── phone-debug
│   ├── worker-deploy
│   ├── mcp-build
│   ├── neon-migration
│   ├── codebase-recon
│   └── release-verification
└── Runtime
    └── load only the required skill
```

Skills should describe **how** to perform a workflow. MCP tools and other runtime integrations provide the actual **capability** to perform it. Authorization must remain upstream of both.

## Security / adoption policy

Do not automatically install every third-party skill.

Use this sequence:

1. Discover the candidate skill.
2. Inspect `SKILL.md`, scripts, references, and assets.
3. Check for shell/Python/Node execution, network calls, credential handling, and destructive actions.
4. Adapt the useful procedure to Caroline's canonical architecture.
5. Vendor or rewrite the approved version as a first-party Caroline skill.
6. Test it in a non-production path.
7. Promote only after verification.

Third-party skill scripts should be treated the same way as third-party source code. Never allow a downloaded skill to bypass Caroline's authorization, secrets, deployment, or audit boundaries.

## Caroline implementation direction

The long-term goal should be a small, curated `caroline-skills` collection rather than a giant universal prompt or an unrestricted community-skill loader.

That gives Caroline and coding agents reusable operating procedures while keeping canonical policy, authorization, secrets, and tool ownership in the existing platform.
