# PB-CF-MIGRATION Step 5-5b — Build Variables Mechanism

## Goal

`Git canonical (main) -> Cloudflare build/deploy` must receive
`VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` automatically, without:
- hardcoding them in source,
- committing a `.env` file,
- depending on variables manually exported in a local shell session.

## Implemented mechanism: GitHub Actions (`.github/workflows/deploy-preview.yml`)

This is the mechanism actually wired up in this repo. On every push to
`main` that touches `app/frontend/**`, `wrangler.toml`, or `src/worker.ts`
(or via manual `workflow_dispatch`), GitHub Actions checks out the repo,
installs dependencies, and runs `npx wrangler deploy` with the two
`VITE_*` vars (and `CLOUDFLARE_API_TOKEN`) injected from **GitHub Actions
Secrets** — never from disk, never from a developer's shell.

### One-time setup required (dashboard action, cannot be scripted)

In the GitHub repo: **Settings -> Secrets and variables -> Actions -> New
repository secret**, add:

| Secret name | Value source |
|---|---|
| `CLOUDFLARE_API_TOKEN` | Cloudflare dashboard -> My Profile -> API Tokens -> Create Token -> template "Edit Cloudflare Workers" (scoped to this account only) |
| `VITE_SUPABASE_URL` | `https://mwdauubztjxkbrefirbg.supabase.co` (pipingbox project) |
| `VITE_SUPABASE_ANON_KEY` | Supabase dashboard -> Project Settings -> API -> `anon` `public` key |

Once these three secrets exist, every push to `main` deploys
`pipingbox-app` to `pipingbox-app.pipingbox.workers.dev` with no manual
step and no local env vars. This workflow deploys to workers.dev only —
`wrangler.toml` has no `[[routes]]` / `custom_domain` block, so it cannot
cause a cutover to `app.pipingbox.com` by itself.

### Reproducibility proxy demonstrated in this session

Since the GitHub secrets have not been created yet (that step needs the
user), full CI-triggered reproducibility cannot be demonstrated end to
end from this environment. As a proxy, the same build+deploy command the
workflow runs was executed as a single non-interactive command with the
two `VITE_*` values scoped only to that command's own subprocess (never
exported into, or left lingering in, the interactive shell session used
for other work) — see deployment ID in the step 5-5b report. This proves
the build/deploy step itself is deterministic given the two values; the
only remaining manual step is adding the three GitHub secrets once.

## Alternative (not implemented): Cloudflare Workers Builds native Git integration

Cloudflare also offers first-party Git integration ("Workers Builds")
that would replace the GitHub Actions workflow above. It is **not**
connected for this project, and cannot be connected via `wrangler` CLI or
any API tool available in this environment — it requires a one-time
browser action in the Cloudflare dashboard (OAuth into GitHub). If you
prefer this path instead of GitHub Actions, here is exactly how it would
be configured:

1. Cloudflare dashboard -> Workers & Pages -> `pipingbox-app` -> Settings
   -> Builds -> **Connect to Git** -> authorize the `pipingbox/DASHBOARD-APP`
   GitHub repo.
2. Build configuration:
   - Root directory: `/` (repo root, where `wrangler.toml` lives)
   - Build command: `cd app/frontend && npm ci && npm run build`
   - Deploy command: `npx wrangler deploy`
3. Settings -> Builds -> **Variables and Secrets** -> add:
   - `VITE_SUPABASE_URL` (as a Secret, not a plaintext Build Variable, even
     though the anon key ends up in the client bundle either way — this
     just prevents it from being echoed in build logs)
   - `VITE_SUPABASE_ANON_KEY` (Secret)
4. Trigger: pushes to `main` -> auto-deploy to `pipingbox-app.pipingbox.workers.dev`.
   Do **not** enable a Production branch / custom domain mapping to
   `app.pipingbox.com` in this step.

Either mechanism (GitHub Actions or Workers Builds) satisfies the
requirement; only one should be enabled at a time to avoid duplicate
deployments. GitHub Actions was chosen as the implemented default because
it is fully expressible as committed code and required no dashboard
action beyond adding three secrets.

## Part B — Supabase Auth Redirect URLs allowlist (dashboard-only, not automatable)

`app/frontend/src/lib/constants.ts` now resolves auth redirects from an
explicit `ALLOWED_AUTH_ORIGINS` allowlist (production + preview) instead
of forcing every non-localhost origin to `app.pipingbox.com`. This fixes
the *client-side* redirect target. However, Supabase Auth independently
enforces its own server-side allowlist ("Redirect URLs") and will reject
any callback whose target isn't in it, regardless of what the client
code requests.

No MCP/API tool in this environment exposes Supabase Auth's URL
Configuration (it isn't a Postgres table — verified via
`information_schema.tables` on schema `auth`; it's an internal GoTrue
config only reachable via the Supabase dashboard or the Management API
with a personal access token, neither of which is available here).

**Required one-time dashboard action** (Supabase dashboard -> project
`pipingbox` -> Authentication -> URL Configuration):
- Site URL: keep as `https://app.pipingbox.com` (production stays canonical)
- Redirect URLs, add:
  - `https://pipingbox-app.pipingbox.workers.dev/**`
  - `http://localhost:*/**` (if not already present, for local dev)

Until this is added, email/password login (used by the Auth E2E gate in
this step) is unaffected — it doesn't go through a Supabase-hosted
redirect. Only Google OAuth and magic-link/password-reset emails clicked
from the preview domain need this allowlist entry, and are explicitly
marked as "manual verification required" in `tests/auth-e2e.spec.ts`
until it's added.

