# Architecture Design

## System Overview
PipingBox is a single-page application (SPA) built with React/Vite on the frontend and Supabase as the backend-as-a-service. It uses Supabase Auth for authentication, PostgreSQL (via Supabase) for data storage, and Supabase Storage for file uploads (CVs, certifications, documents). The app supports three user roles: admin, company, and worker.

## Tech Stack
- **Frontend**: React 18, Vite 5, TypeScript, Tailwind CSS 3, shadcn/ui, Radix UI primitives
- **State Management**: React Query (TanStack), React Context
- **Routing**: React Router DOM v6
- **Internationalization**: i18next + react-i18next (EN/ES)
- **Backend**: Supabase (Auth, PostgreSQL, Storage, RLS)
- **Charts**: Recharts
- **Forms**: React Hook Form + Zod validation
- **Build**: Vite with vite-prerender-plugin for SEO

## Module Design
| Module | Responsibility | Key Files |
|--------|---------------|-----------|
| Auth | User registration, login, session, role management | hooks/useAuth.tsx, pages/Login.tsx, pages/Register.tsx |
| Dashboard | Main overview with stats and quick actions | pages/Dashboard.tsx |
| Profile | Worker profile management, CV, completeness | pages/Profile.tsx, components/profile/* |
| Jobs | Job listings, filtering, applications | pages/Jobs.tsx, pages/Applications.tsx |
| Community | Discussion channels and posts | pages/Community.tsx, components/community/* |
| Messaging | Real-time messaging between users | pages/Messages.tsx, lib/messaging.ts, hooks/useUnreadMessages.ts |
| Certifications | Cert management, expiry alerts, reminders | components/profile/CertificationsSection.tsx, lib/certificationReminders.ts |
| Work Experience | Multilingual work history management | components/profile/WorkExperienceSection.tsx, lib/workerProfile.ts |
| Admin | User management, analytics, audit log | pages/Admin.tsx, components/admin/* |
| Company | Company dashboard, candidates, job posting | pages/CompanyDashboard.tsx, pages/company/* |
| Layout | App shell, navigation, notifications | components/layout/AppShell.tsx |
| i18n | Translation management | i18n/locales/en.json, i18n/locales/es.json |

## Tech Decisions
| Decision | Choice | Rationale |
|----------|--------|-----------|
| UI Framework | shadcn/ui + Radix | Accessible, customizable, dark-mode friendly |
| Backend | Supabase | Auth + DB + Storage + RLS in one service |
| State | React Query | Server state caching, auto-refetch, optimistic updates |
| i18n | i18next | Mature, supports namespaces, browser detection |
| Styling | Tailwind CSS | Utility-first, consistent with shadcn/ui |
| Routing | React Router v6 | Standard SPA routing with nested routes |
| Forms | React Hook Form + Zod | Type-safe validation with good DX |
| SEO | vite-prerender-plugin | Pre-render key pages for search engines |

## File Tree Plan
```
app/frontend/
├── src/
│   ├── main.tsx                    # App entry point
│   ├── App.tsx                     # Root component with routing
│   ├── index.css                   # Global styles
│   ├── pages/                      # Route-level page components
│   │   ├── Dashboard.tsx
│   │   ├── Profile.tsx
│   │   ├── Jobs.tsx
│   │   ├── Messages.tsx
│   │   ├── Admin.tsx
│   │   ├── Community.tsx
│   │   ├── CompanyDashboard.tsx
│   │   └── company/               # Company-specific sub-pages
│   ├── components/
│   │   ├── ui/                    # shadcn/ui base components
│   │   ├── layout/                # AppShell, navigation
│   │   ├── profile/               # Profile sections (WorkExp, Certs, CV, Completeness)
│   │   ├── admin/                 # Admin-specific components
│   │   ├── community/             # Community components
│   │   ├── certifications/        # Certification components
│   │   └── blog/                  # Blog components
│   ├── hooks/                     # Custom React hooks
│   ├── lib/                       # Utilities, API clients, types
│   ├── contexts/                  # React context providers
│   └── i18n/                      # Internationalization config and locales
├── public/                        # Static assets
├── package.json
└── vite.config.ts
```

## Implementation Guide
1. All database operations go through Supabase client (`lib/supabase.ts`) with table names from `TABLES` constant
2. Authentication state managed via `useAuth` hook which provides user, profile, and role info
3. All user-facing strings must use `t()` from `useTranslation()` hook
4. Profile-related components live in `components/profile/` and are composed in `pages/Profile.tsx`
5. RLS policies on Supabase enforce that users can only access their own data (with exceptions for company viewing candidates)
6. Work experience supports multilingual fields (description_en, description_es) with normalization functions in `lib/workerProfile.ts`
7. Profile completeness is calculated client-side by checking profile fields and counting related records