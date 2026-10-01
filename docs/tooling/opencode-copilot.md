# OpenCode + GitHub Copilot

Saved: 2026-10-01

## Primary links

- GitHub Marketplace: https://github.com/marketplace/opencode-copilot
- Current OpenCode repository: https://github.com/anomalyco/opencode
- OpenCode site/docs: https://opencode.ai

## What it is

The GitHub Marketplace app lets an existing GitHub Copilot subscriber authenticate OpenCode through GitHub and use AI coding models exposed by that Copilot subscription from the OpenCode workflow.

GitHub currently describes the integration as free to install with no additional OpenCode Copilot charge. Actual model availability depends on the GitHub Copilot plan, region, and GitHub's current model offerings.

## Why this is useful

- Reuse an existing GitHub Copilot subscription in OpenCode.
- Work from OpenCode's terminal-first coding-agent workflow.
- Use supported Copilot models without separately wiring provider API keys for every model.
- Keep GitHub authorization in GitHub's normal OAuth/app flow.

## Recommended setup

1. Install the OpenCode GitHub Marketplace app:
   https://github.com/marketplace/opencode-copilot
2. Make sure GitHub Copilot is active on the GitHub account.
3. Install or update the current OpenCode from the anomalyco project.
4. In OpenCode, choose **Sign in with GitHub Copilot**.
5. Complete GitHub authorization.
6. Verify the model list OpenCode exposes for the account.

## Important notes

- The Marketplace app is published by **anomalyco**, the current OpenCode project.
- Do not confuse the current project with the older `opencode-ai/opencode` repository; that older repository is archived and says development moved.
- Prefer the official GitHub authorization flow for Copilot authentication instead of hardcoding a GitHub token into project files.
- Never commit GitHub, Copilot, or provider credentials to this repository.
- Model names and availability can change, so treat the OpenCode model picker after sign-in as the current source of truth.

## Potential Caroline use

This is most useful as a developer/operator tool around Caroline rather than as a Caroline production runtime dependency. It could give an OpenCode coding agent access to the Caroline repository while using models available through the GitHub Copilot subscription.

Before giving any coding agent write/deploy authority, keep Caroline's production boundaries intact: secrets remain out of Git, production configuration remains with the authoritative service, and deployment permissions should be explicit.
