# PB-CF-MIGRATION Step 5-5b (gate 1) — Preview / Production Separation

## Goal

Connecting `app.pipingbox.com` to a Cloudflare Worker must never turn
every push to `main` into an unapproved production deploy. Preview and
production are split into two Workers, two workflows, and one approval
gate.

## Architecture

| | Worker name | Domain | Workflow | Trigger |
|---|---|---|---|---|
| Preview | `pipingbox-app` | `pipingbox-app.pipingbox.workers.dev` | `.github/workflows/deploy-preview.yml` | every push to `main` touching `app/frontend/**`, `wrangler.toml`, `src/worker.ts`, or the workflow itself (+ manual `workflow_dispatch`) |
| Production | `pipingbox-app-prod` | `app.pipingbox.com` (**not attached yet**) | `.github/workflows/deploy-production.yml` | **manual `workflow_dispatch` only**, requires an explicit `commit_sha` input |

Both Workers are defined in the same `wrangler.toml`: the top-level
block is the preview default (`wrangler deploy`), and `[env.production]`
is a named environment (`wrangler deploy --env production`) with its own
`name` and its own `[env.production.assets]` block. They share the same
`main = "src/worker.ts"` and the same static-assets SPA-fallback config.
`[env.production]` deliberately has **no** `[[routes]]` / `custom_domain`
key — attaching `app.pipingbox.com` is a separate, explicitly-authorized
step that has not happened yet.

## Approval gate: GitHub Environment `production`

`deploy-production.yml` declares `environment: production` on its job.
GitHub auto-creates that Environment the first time the workflow runs,
but **without protection rules** until an admin configures them manually
(this cannot be done via API/CLI in this environment — same OAuth-only
limitation as the earlier Cloudflare Workers Builds step).

**One-time manual step required** (repo admin):
1. GitHub repo → **Settings → Environments → New environment** → name it
   exactly `production` (must match the workflow's `environment:` value).
2. Under **Deployment protection rules**, enable **Required reviewers**
   and add the approver(s) who must sign off before a production
   deployment run is allowed to proceed.
3. Optionally restrict which branches can deploy to this environment
   (e.g. only `main`).

Once configured, every run of `deploy-production.yml` will pause at the
`deploy` job and wait for a reviewer to approve it in the Actions UI
before `wrangler deploy --env production` executes.

## How to run a production deployment

1. Confirm the target commit SHA has already been deployed to preview
   and passed the browser/Auth E2E gates.
2. GitHub repo → **Actions → Deploy Cloudflare Workers Production → Run
   workflow**.
3. Fill in `commit_sha` with the exact full (or unambiguous short) SHA
   to deploy. This is a required field; the workflow also independently
   re-verifies that the checked-out `HEAD` matches it before deploying.
4. If the `production` Environment has required reviewers configured,
   approve the pending deployment when prompted.
5. The job deploys **only** `pipingbox-app-prod` via
   `wrangler deploy --env production`. It never touches the preview
   Worker (`pipingbox-app`) and never touches `app.pipingbox.com` /
   DNS / Custom Domains / Routes, since none of those are configured
   under `[env.production]` yet.

## Rollback

Primary method (deterministic, does not depend on Cloudflare's
assets-rollback API behavior): **re-run `deploy-production.yml` with
`commit_sha` set to the previous known-good production commit.** Because
production deploys are always keyed to an exact commit and the build is
reproducible from GitHub Secrets, redeploying the prior SHA reconstructs
the prior state byte-for-byte.

Secondary method (faster, CLI-only, use if you have local `wrangler`
auth against the same Cloudflare account):
```
npx wrangler deployments list --name pipingbox-app-prod
npx wrangler rollback --name pipingbox-app-prod <previous-deployment-id>
```

Keep a record of the last known-good production `commit_sha` outside
this repo (e.g. in the deployment approval comment) so a rollback never
depends on searching git history under pressure.

## What is explicitly NOT done in this step

- `app.pipingbox.com` is **not** attached to `pipingbox-app-prod` (no
  `custom_domain` / `[[routes]]` in `[env.production]`).
- No DNS change.
- `deploy-production.yml` has never been run yet — `pipingbox-app-prod`
  does not exist as a live Worker until its first manual dispatch.
- The `production` GitHub Environment protection rule (required
  reviewers) still needs the one-time manual dashboard step above.
