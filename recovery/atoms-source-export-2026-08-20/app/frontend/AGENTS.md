# AGENTS.md — PipingBox DASHBOARD-APP

> **Read this BEFORE writing any code. This is the minimum context every AI agent (Atoms, Codex, Copilot, Verdent) needs.**
>
> The full knowledge base lives in the **PIPINGBOX-BRAIN** repository (`github.com/pipingbox/PIPINGBOX-BRAIN`). This file is a quick reference, not a replacement. When in doubt, the Brain wins.

---

## What PipingBox is

PipingBox is the operating system for the European industrial piping workforce: **marketplace + tools + training + community** in one ecosystem. Workers are free forever (DEC-32). Companies pay. The first paid product is VCA certification preparation at 59.90 EUR (DEC-30).

---

## Stack (do not change without approval)

- **Frontend:** React 18 + TypeScript + Vite + Tailwind CSS + shadcn/ui (Radix primitives)
- **Routing:** React Router DOM (no Next.js — DEC-02)
- **State:** TanStack Query (server), React Hook Form + Zod (forms), useState (UI)
- **Backend:** Supabase (PostgreSQL + Auth + Storage + Realtime + Edge Functions — DEC-01)
- **i18n:** react-i18next. 6 languages: EN, ES, DE, FR, NL, PT
- **Hosting:** Vercel (DEC-48). Domains: pipingbox.com + app.pipingbox.com (DEC-49)
- **Icons:** lucide-react

**Forbidden without human approval:** Next.js, Firebase, Redux, Prisma, separate backend server, new CSS framework, new UI library, new database, light mode / theme switch (DEC-45).

---

## The 5 rules that matter most

1. **Business logic in `src/lib/`, never in components.** Components render. Hooks orchestrate. `src/lib/` decides.
2. **No hardcoded values.** Table names use `TABLES.*` from `src/lib/supabase.ts`. UI strings use `t('key')`. Credentials and config use `import.meta.env.VITE_*`. No hardcoded admin emails, no hardcoded business constants in components.
3. **No fabricated data (DEC-33).** Never show fake metrics, fake job counts, fake activity feeds, or fake "verified" badges. If real data is zero, show zero or an empty state. One discovered fake number destroys trust.
4. **No real company names without verified partnerships (DEC-42).** Use fictional names (e.g., "Trident Upstream Energy") in placeholders and examples.
5. **Dark theme only (DEC-45).** No light mode. No theme toggle. Palette below.

---

## Design tokens (use these, do not invent colors)

```
Background:     #0a0a0a (page), #0d0d0d (cards), zinc-950 (inputs)
Borders:        zinc-800 / zinc-800/80
Accent:         #f59e0b (amber-500), hover #d97706 (amber-600)
Text:           zinc-100 (primary), zinc-300 (secondary), zinc-400 (muted), zinc-500 (labels), zinc-600 (disabled)
Success:        emerald-400/500
Warning:        amber-400
Danger:         red-400/500
Info:           blue-400
```

Font: system default (no custom font loaded). Spacing scale: 4, 8, 12, 16, 20, 24, 32, 40, 48, 64. Touch targets: minimum 44×44px. Mobile-first: design for 375px width first, then scale up.

---

## File structure

```
src/
├── components/        ← Presentational components (shadcn/ui + custom)
│   ├── ui/            ← shadcn/ui primitives (do not edit unless necessary)
│   ├── layout/        ← AppShell, nav
│   └── ...
├── pages/             ← Route-level pages (one default export per file)
├── hooks/             ← Custom hooks (useAuth, useUnreadMessages, etc.)
├── lib/               ← Business logic, constants, helpers, supabase client
│   ├── supabase.ts    ← Client + TABLES constants + edgeFunctionUrl()
│   ├── admin.ts       ← isPrimaryAdmin() (reads VITE_PRIMARY_ADMIN_EMAIL)
│   ├── logger.ts      ← Dev-only logger (silenced in prod by main.tsx)
│   ├── roles.ts       ← RBAC helpers
│   └── ...
├── tools/             ← Engineering tools (plugin pattern, ARCH-002)
│   ├── unit-converter/
│   └── ...
├── i18n/              ← i18next config + locales/
│   └── locales/       ← en.json, es.json, de.json, fr.json, nl.json, pt.json
└── main.tsx           ← Entry point (silences console.log in prod — TD-13)
```

**What NEVER goes in components:** Supabase queries with inline table names, business rules, pricing logic, RBAC checks (use hooks/lib instead).

---

## Supabase access rules

- Always use `TABLES.*` from `src/lib/supabase.ts`. Never inline a table name string.
- RLS is enforced on every table (DEC-07). Never disable RLS. Never use the service role key in frontend code.
- Edge Function URLs: use `edgeFunctionUrl('function-name')` from `src/lib/supabase.ts`. Never hardcode the Supabase project URL.
- New table? Add it to `TABLES`, create a migration with RLS enabled, add policies. See `brain/07-TEMPLATES/SUPABASE_MIGRATION_TEMPLATE.md`.

---

## Environment variables (required)

```
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
VITE_PRIMARY_ADMIN_EMAIL=admin@pipingbox.com
```

Copy `.env.example` to `.env.local` and fill in real values. `.env.local` is gitignored. Never commit secrets.

---

## i18n rules

- Every user-facing string uses `t('namespace.key')`. No hardcoded strings in JSX.
- Use `t('key', { defaultValue: 'English text' })` for new keys so the app doesn't break if translations are incomplete.
- Add new keys to `src/i18n/locales/en.json` (reference) and `src/i18n/locales/es.json`.
- Backend enum values (e.g., `'applied'`, `'published'`) are NOT translated — only the display label is.

---

## Git & PR rules

- One ticket per commit. Commit message format: `TICKET-ID: short description. Details.`
- No `console.log` in production (silenced by `main.tsx` polyfill — TD-13). New code should use `logger` from `src/lib/logger.ts`.
- PRs use the template in `brain/07-TEMPLATES/PR_TEMPLATE.md`.
- Run `npx vite build` before committing. The build must succeed.

---

## Key decisions (do not reopen without Gaspar's approval)

| ID | Decision |
|----|----------|
| DEC-01 | Supabase is the sole backend |
| DEC-02 | React + Vite (no Next.js, no SSR) |
| DEC-07 | RLS on every table |
| DEC-16 | Tools are public (no login required) |
| DEC-20 | PipingBox prepares for exams, never certifies |
| DEC-24 | Free tools are the primary acquisition channel |
| DEC-30 | VCA Basic price: 59.90 EUR |
| DEC-32 | Workers are free forever |
| DEC-33 | Never display fabricated metrics |
| DEC-34 | Company verification is a workflow, not auto-badge |
| DEC-42 | No real company names without verified partnerships |
| DEC-45 | Dark theme is permanent, no light mode |
| DEC-48 | Vercel as hosting provider |

Full list: 49 decisions in `brain/00-FOUNDATION/CTO_MEMORY.md`.

---

## When you finish a task

1. Verify `npx vite build` succeeds.
2. Verify no hardcoded strings, table names, or fabricated data.
3. Test mobile (375px width) — tables scroll horizontally, touch targets ≥ 44px.
4. If a permanent decision was made during work, note it for Brain update (Golden Rule).

---

*Maintained by: CTO Agent | Brain v1.31 | This file mirrors PIPINGBOX-BRAIN. When the Brain updates this section, update this file too.*
