# Requirements & Progress

## Requirements Overview
PipingBox recruitment platform with user auth, job board, community, messaging, certifications, multilingual profiles, and profile completeness tracking.

## User Stories
- As a worker, I can manage my profile with work experience, certifications, and CV in multiple languages
- As a worker, I can see my profile completeness and know what to fill in
- As a company user, I can view candidate profiles and manage applications
- As a company user, I can message candidates about job applications
- As an admin, I can manage users, view analytics, and audit actions
- As a worker, I receive certification expiry reminders

## Task Breakdown
- [x] Initialize React + Vite SPA with Supabase connection
- [x] Create notifications table with expanded schema via Supabase SQL
- [x] Expand lib/notifications.ts with all notification types and creation helpers
- [x] Build enhanced NotificationsBell with all notification type rendering
- [x] Create useNotifications hook with real-time support
- [x] Integrate automatic notification triggers into existing flows
- [x] Build Admin Notifications tab in Admin page
- [x] Add i18n translations for all notification types (EN/ES)
- [x] Implement user authentication with role selection
- [x] Build Dashboard with live data
- [x] Add Work Day / Salary Log feature
- [x] Create Community module with channels and posts
- [x] Add Profile and Certification features
- [x] Build Admin Center with analytics and audit log
- [x] Implement Company Dashboard and company-specific pages
- [x] Add Job Board with filtering and applications
- [x] Create Candidate Profile page with action buttons
- [x] Implement Messaging system with unread indicators
- [x] Add multilingual support (EN/ES)
- [x] Implement Certification expiry alerts and renewal reminders
- [x] Enhance Work Experience module with multilingual support
- [x] Add Profile Completeness indicator
- [x] Fix Work Experience module schema alignment
- [x] Fix Worker Documents module schema alignment with advanced fields
- [x] Create FilePreviewModal component (PDF/image/fallback)
- [x] Add Ver/Descargar buttons to CandidateProfile certifications
- [x] Add Ver/Descargar buttons to CandidateProfile documents
- [x] Add preview to CandidateProfile CV section
- [x] Add preview to worker Profile sections (Certs, Docs, CV)
- [x] Implement Professional Referral & Rewards system with registration capture
- [x] Connect Worker Search UI to real Supabase data with filters and worker cards
- [x] Enhance referral system with persistent storage, verification logic, and global URL capture
- [x] Implement "Invite to Job" feature in CandidateProfile with job selection modal and message
- [x] Add PendingInvitationsWidget for workers to view/accept/decline job invitations on Dashboard
- [x] Add JobInvitationsStatusWidget to Company Dashboard with visual status indicators
- [x] Create candidate notification on successful job invitation with bell dropdown support
- [x] Fix signup flow to auto-create profile in app_14da0f1941_profiles with all required fields
- [x] Deploy enhanced backfill-profiles edge function with pagination, detailed response, and role='user' default
- [x] Add account type selection (Worker/Company) to Register page with visual card selector
- [x] Add Google OAuth sign-in to Register and Login pages
- [x] Update registration onboarding copy for industrial professionals
- [x] Fix full browser and link preview branding (favicon, OG, Twitter, manifest, theme-color)
- [x] Create Admin → Registros internal user traceability module
- [x] Fix orphan user detection: AdminRegistros now reads auth.users + profiles combined
- [x] Deploy enhanced backfill-profiles edge function with GET mode for listing orphans
- [x] Add auto-repair button to create missing profiles for orphan auth users
- [x] Add exponential backoff retry (3 attempts) to ensureProfile for future registrations
- [x] Fix AdminRegistros to use edge function as primary data source for auth.users + profiles combined view
- [x] Update ensureProfile defaults: cv_visible=false, availability_status='not_specified', auto-generate referral_code
- [x] Add marketplace filter to Worker Search (only show profiles with completion>=30, name+position, cv_visible=true)
- [x] Enhance AdminRegistros with proper referral assignment modal (select referrer from dropdown)
- [x] Update onboarding status badges: SOLO AUTH / PROFILE STARTED / MARKETPLACE READY
- [x] Update backfill-profiles edge function: cv_visible=false, availability_status='not_specified', generate referral_code
- [x] Implement ultra-fast onboarding wizard (8-step flow: account type, role, specialties, location, availability, travel/relocation, profile visibility, photo)
- [x] Fix mobile horizontal overflow in AppShell layout
- [x] Add profile visibility step to onboarding (public/private choice with cv_visible sync)
- [x] Add ProfileCompletionCard to Dashboard with progress bar and pending items
- [x] Update Worker Search marketplace filter to respect profile_visibility field
- [x] Update AdminRegistros onboarding status to use profile_visibility
- [x] Save partial progress after each onboarding step (instant save)
- [x] Unify profile completion calculations across platform (centralized COMPLETION_THRESHOLDS)

## Progress Log
- 2026-05-04: Project initialized with React + Vite SPA, Supabase connected, Dashboard with live data, Work Day Log, Community module, Profile/Certifications features
- 2026-05-05: Multilingual support (EN/ES) added, notifications system, dashboard fixes, favicon/logo updates
- 2026-05-06: Google Analytics 4 integrated, post creation flow improved
- 2026-05-09: Jobs page enhancements, admin dashboard fixes, CRM features, Companies page, Request Workforce feature
- 2026-05-11: My Applications page, premium filters, content drafts, Admin Center enhancements, role-based access, RLS policies, Company Dashboard and pages, analytics/audit log
- 2026-05-12: Candidate Profile page, job application flow, messaging system with unread badges, logo replacement
- 2026-05-13: Certification expiry alerts, dark mode improvements, Worker Profile enhancements, multilingual work experience system, Profile Completeness indicator, schema fixes
- 2026-05-14: Worker Documents module schema fix - added WorkerDocument interface with advanced fields (document_category, expires_at, verified, file_size, mime_type), updated DocumentsSection with full CRUD and upload, added documents display to CandidateProfile
- 2026-05-14: Added FilePreviewModal component with PDF/image/fallback support. Updated CandidateProfile with Ver/Descargar buttons for CV, certifications, and documents sections
- 2026-05-14: Added Availability & Mobility display section to CandidateProfile showing employment status, availability, notice period, rotation preference, travel/relocate willingness, and preferred regions
- 2026-05-14: Implemented Professional Referral & Rewards system - referral code generation, tiered rewards (3/10/25 referrals), ProNetworkWidget on Dashboard, referral code capture from registration URL (?ref=CODE), post-signup referral processing via localStorage bridge
- 2026-05-14: Connected Worker Search UI to real Supabase data - fetches from app_14da0f1941_profiles (role=worker), aggregates experience/certification/document counts, shows availability/travel/relocate badges, keyword+filter search, profile completeness %, links to /candidate/:userId
- 2026-05-16: Implemented ultra-fast onboarding wizard (6-step flow: account type, role, specialties, location, availability, photo) with skip option, progress bar, and profile completion scoring. Fixed mobile horizontal overflow in AppShell with overflow-x-hidden, min-w-0, responsive padding/gaps, and constrained search input
- 2026-05-14: Enhanced referral system - persistent multi-storage code capture (localStorage+sessionStorage+cookie), global URL capture hook on all pages, referral verification logic (auto-verifies after onboarding+activity), improved ProNetworkWidget with WhatsApp/native share, tiered reward display
- 2026-05-14: Implemented "Invite to Job" feature - InviteToJobModal component with job selection, optional message, Supabase job_invitations table integration, EN/ES translations, integrated into CandidateProfile action buttons
- 2026-05-15: Fixed signup flow - ensureProfile now creates profile in app_14da0f1941_profiles with all required fields (user_id, full_name, role, account_type=worker, cv_visible=true, availability_status=available, profile_completion=10), referral code processing, retry logic, and console logging (PROFILE CREATED/EXISTS/ERROR)
- 2026-05-15: Added account type selection (Worker/Company) to Register page with visual card selector, Google OAuth sign-in on both Register and Login pages, updated onboarding copy for industrial professionals, ensureProfile now respects selected account_type for role assignment
- 2026-05-15: Created Admin → Registros internal traceability module with: stats counters (total, onboarding OK, empresas, Google OAuth, referrals, huérfanos), filter buttons (todos/completos/incompletos/empresas/referrals/solo auth), search by name/email/company/code, onboarding status badges (🟢 COMPLETO / 🟡 REGISTRO PARCIAL / 🔴 SOLO AUTH / 🔵 EMPRESA PENDIENTE), profile completion progress bars, referral tracking, CSV export, login method detection
- 2026-05-15: Fixed AdminRegistros to use edge function (service_role_key) as PRIMARY data source for auth.users, merged with profiles table. Now correctly shows orphan users (auth-only without profile row), added manual referral linking action button, improved error handling with fallback to profiles-only mode when edge function unavailable