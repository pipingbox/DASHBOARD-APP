/**
 * PB-SEO-103: canonical registry of SEO tool-landing pages.
 *
 * One row per REAL, implemented tool that gets a public, prerendered,
 * indexable landing route (/tools/<slug>). The registry is pure data with no
 * imports so it can be consumed by:
 *   - SPA_ROUTE_CONTRACT.ts (edge validation of /tools/:slug)
 *   - prerender/tool-landings.js (prerender route list)
 *   - prerender/sitemap.js (sitemap entries)
 *   - src/pages/ToolLandingPage.tsx (page rendering)
 *
 * Rules:
 *   - Only add tools that are IMPLEMENTED and reachable in the catalog
 *     (/tools?t=<toolKey>). Never create landing pages for planned tools.
 *   - slugs are SEO-stable: kebab-case, never renamed once indexed.
 *   - i18nKey selects the copy block under `tools.landing.<i18nKey>` in every
 *     locale file (structure enforced by scripts/check-i18n-schema.mjs).
 */

export interface ToolLandingConfig {
  /** Canonical URL segment: /tools/<slug> (no trailing slash). */
  slug: string;
  /** Catalog key of the interactive tool (/tools?t=<toolKey>). */
  toolKey: string;
  /** Copy block under tools.landing.<i18nKey> in the locale files. */
  i18nKey: string;
  /** Catalog name key (tools.<nameKey>) for short link labels. */
  nameKey: string;
  /** Other landing slugs surfaced as related tools. */
  related: string[];
}

export const TOOL_LANDINGS: readonly ToolLandingConfig[] = [
  {
    slug: 'flange-dimensions',
    toolKey: 'flanges',
    i18nKey: 'flangeDimensions',
    nameKey: 'flanges.name',
    related: ['stud-bolts', 'pipe-dimensions'],
  },
  {
    slug: 'stud-bolts',
    toolKey: 'bolts-nuts',
    i18nKey: 'studBolts',
    nameKey: 'bolts.name',
    related: ['flange-dimensions', 'pipe-dimensions'],
  },
  {
    slug: 'pipe-dimensions',
    toolKey: 'pipe-dimensions',
    i18nKey: 'pipeDimensions',
    nameKey: 'pipeDim.name',
    related: ['flange-dimensions', 'stud-bolts'],
  },
  {
    slug: 'elbow-cut',
    toolKey: 'elbow-cut',
    i18nKey: 'elbowCut',
    nameKey: 'elbowCut.name',
    related: ['branch-layout', 'pipe-dimensions'],
  },
  {
    slug: 'branch-layout',
    toolKey: 'branch-layout',
    i18nKey: 'branchLayout',
    nameKey: 'branchLayout.name',
    related: ['elbow-cut', 'pipe-dimensions'],
  },
];

export const TOOL_LANDING_SLUGS: readonly string[] = TOOL_LANDINGS.map((t) => t.slug);

export function getToolLandingConfig(slug: string): ToolLandingConfig | undefined {
  return TOOL_LANDINGS.find((t) => t.slug === slug);
}
