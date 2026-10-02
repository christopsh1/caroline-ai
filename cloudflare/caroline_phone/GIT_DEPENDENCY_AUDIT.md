# Caroline Phone — Git / Repository Dependency Audit

Date: 2026-09-25
Scope: `caroline-phone` runtime, deployment path, related queue provisioning automation, and repository-wide triggers that could react to Caroline Phone changes.

## Result

Caroline Phone is no longer intended to depend on Git, GitHub, GitLab, repository-hosted CI/CD, push-triggered deployment, branch previews, repository secrets, or repository-connected Cloudflare Builds.

The live Worker itself remains in Cloudflare. Removing automation does not delete the deployed Worker, its routes, gateway access secrets, Durable Objects, or other production resources.

## Dependencies found and disposition

| Location / provider | Dependency found | Effect | Safe to remove? | Disposition / replacement |
| --- | --- | --- | --- | --- |
| `.github/workflows/deploy-caroline-phone.yml` | GitHub Actions, push/main trigger, `actions/checkout`, `cloudflare/wrangler-action`, repository secrets | Deployment | Yes | Removed. Replace with Cloudflare Dashboard/Quick Edit or standalone local `wrangler deploy`. |
| `.github/workflows/validate-caroline-phone.yml` | pull-request/push validation, `actions/checkout`, hosted runner | Developer workflow / CI | Yes | Removed. Replace with local `npm run check` and `npx wrangler deploy --dry-run`. |
| `.github/workflows/provision-caroline-queues.yml` | push-triggered GitHub Actions using repository Cloudflare secrets | Infrastructure provisioning | Yes; queues survive workflow deletion | Removed. Manage queues directly in Cloudflare Dashboard/API/local Wrangler. |
| `.github/workflows/provision-caroline-queues-transfer.yml` | GitHub Actions, repository secrets, push trigger | Infrastructure provisioning | Yes; queues survive workflow deletion | Removed. Manage queues directly in Cloudflare. |
| `.github/workflows/deploy-caroline-event-worker.yml` | `cloudflare/**` path filter indirectly reacted to Caroline Phone changes | Indirect CI coupling | Yes to decouple; no need to delete unrelated event-worker automation | Narrowed to event-worker source/config only. Caroline Phone files no longer trigger it. |
| `cloudflare/.env.example` | GitHub Actions deployment wording; unused OpenRouter live-call key inventory | Documentation / environment template | Yes | Updated for Dashboard/local Wrangler and the Infisical secrets-gateway contract. |
| `cloudflare/caroline_phone/src/llm.ts` | live OpenRouter/custom-chat proxy | Runtime (incorrect architecture) | Yes | Removed completely. |
| `cloudflare/caroline_phone/src/llm-control.ts` | custom-LLM bootstrap state | Runtime (incorrect architecture) | Yes | Removed completely. |
| `cloudflare/caroline_phone/tests/llm.test.ts` | tests for removed custom LLM/OpenRouter path | Tests | Yes | Removed and replaced by native-runtime tests. |
| `cloudflare/caroline_phone/wrangler.toml` | `LLM_CONTROL` binding and bootstrap cron | Runtime config | Yes | Removed. Only phone orchestration state remains; `EVENT_LEDGER` added for post-call idempotency. |
| `cloudflare/caroline_phone/README.md` | Previous deployment assumptions and obsolete architecture | Documentation | Yes | Rewritten for ElevenLabs-native live runtime, direct deployment only, and Infisical-backed runtime secrets. |
| root `README.md` | Repository described as production source-controlled baseline | Governance / developer workflow | Yes for phone authority | Updated: Caroline Phone is explicitly excluded from repository deployment authority. |
| Cloudflare Workers Builds / Git integration | Account-level repository connection may exist outside source files | Deployment provider setting | Yes; prior Worker versions remain deployed | Must be disconnected in Cloudflare: Workers & Pages -> `caroline-phone` -> Settings -> Builds -> Disconnect. Current connector can inspect the Worker but cannot mutate Builds connections. |

## Search terms reviewed

The audit covered the requested Git/repository concepts including Git, GitHub, GitLab, workflows, repository/repo, commit, branch, pull request, merge, checkout, clone, Cloudflare Builds/Git integration, `wrangler-action`, `actions/checkout`, `GITHUB_`, `CF_PAGES_BRANCH`, branch previews, deploy-on-push, remote origin and common Git command language.

No Caroline Phone runtime requirement was found for GitLab, Pages Git integration, `CF_PAGES_BRANCH`, branch-preview configuration, or a Git remote. The repository contains unrelated Git automation for other Caroline components; those are outside the Caroline Phone runtime and no longer watch the Caroline Phone folder.

## Correct deployment replacement

### Cloudflare Dashboard

Use the existing `caroline-phone` Worker directly. Edit code and bindings through the Worker dashboard. Do not import or connect a repository.

For secrets, Cloudflare may hold only the two secrets-gateway access bindings:

- `GATEWAY_TOKEN`
- `GATEWAY_URL`

Provider, application, and database credentials remain in Infisical Development and are resolved at runtime through `secrets-gateway`, scoped by `WORKER_NAME`.

### Standalone local Wrangler

Use a local folder outside a Git working tree:

```bash
npm install
npm run check
npx wrangler deploy --dry-run
npx wrangler deploy
```

Do not copy Twilio, ElevenLabs, Neon, backend, OpenAI, Cohere, or other provider credentials into local Wrangler files. Local Worker execution should use only the gateway access values plus non-secret configuration. Local Cloudflare authentication must not be stored in project files.

## Production preservation

This audit/removal does not authorize deletion or recreation of:

- the live Twilio number or its routing;
- either ElevenLabs Caroline agent;
- the `caroline-phone` Worker;
- the two gateway-access Worker secrets, custom domains/routes, Durable Object data, KV, R2, D1 or queues;
- Infisical provider/application/database secret records or their per-worker tags;
- Supabase/database records;
- the standalone `caroline-event-worker` runtime.

Provider-side source-repository disconnection must preserve the currently deployed Worker version.
