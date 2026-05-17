# Project Context

## Project Overview
PipingBox is a SaaS platform for piping engineers in the B2B recruitment sector. It provides tools for user management, job listings, community engagement, certifications, messaging, and profile management. The platform is multilingual (English/Spanish) and uses a Supabase backend with a React/Vite frontend styled with Tailwind CSS and shadcn/ui.

## Key Decisions
| Date | Decision | By | Rationale |
|------|----------|-----|-----------|
| 2026-05-04 | React + Vite SPA with Supabase backend | Team | Modern stack with real-time capabilities and easy auth |
| 2026-05-04 | shadcn/ui + Tailwind CSS for UI | Team | Consistent dark-themed design system with accessible components |
| 2026-05-05 | i18next for multilingual (EN/ES) | Team | Large Spanish-speaking user base in piping industry |
| 2026-05-09 | Role-based access (admin/company/worker) | Team | Different user types need different views and permissions |
| 2026-05-11 | Supabase RLS policies for security | Team | Row-level security ensures data isolation between users/companies |
| 2026-05-12 | Real-time messaging via Supabase | Team | Enable direct communication between recruiters and candidates |
| 2026-05-13 | Multilingual work experience with normalization | Alex | Workers input in native language, viewers see in preferred language |
| 2026-05-13 | Weighted profile completeness scoring | Alex | Encourage profile completion with visual progress indicator |

## Constraints
- Dark mode UI theme (bg-[#0d0d0d], zinc-800 borders, amber/gold accents #f59e0b)
- All user-facing text must support EN/ES via i18next
- Supabase RLS policies enforce data access control
- Profile completeness weights: Photo 10%, Name 5%, Position 5%, Company 5%, Location 5%, Years 5%, Skills 10%, Bio 10%, CV 15%, Experience 15%, Certification 10%, Documents 5%
- Work experience supports multilingual descriptions (description_en, description_es)
- Maximum 8 code files per implementation task