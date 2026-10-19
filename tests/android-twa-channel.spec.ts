/**
 * PB-ANDROID-PLAYSTORE-001 — Android TWA channel contracts.
 *
 * Static/unit checks (no browser, no network):
 *  1. Channel detection resolves web vs android_twa from closed signals.
 *  2. Tools-funnel events are in the closed taxonomy and only accept closed
 *     enums (tool_key, error_category, cta_location); inputs/results/PII dropped.
 *  3. The offline fallback worker is registered ONLY from the Android channel.
 *  4. sw.js never caches index.html / bundles / version.json (stale-version
 *     detection contract of appVersion.ts).
 *  5. The TWA manifest is coherent with the SPA contract (package id, host,
 *     start URL under /tools with the channel marker, no notifications, min SDK).
 *  6. /offline.html is declared in the SPA route contract.
 *  7. Signing material is ignored by Git in android/twa.
 */
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  resolveAppChannel,
  ANDROID_PACKAGE_ID,
  APP_CHANNEL_QUERY_PARAM,
} from '../app/frontend/src/lib/appChannel';
import { shouldRegisterOfflineFallback } from '../app/frontend/src/lib/registerOfflineFallback';
import {
  OBS_EVENT_NAMES,
  buildEventProps,
  TOOL_KEYS,
  CALCULATION_ERROR_CATEGORIES,
  CTA_LOCATIONS,
} from '../app/frontend/src/lib/observability';
import { STATIC_WELL_KNOWN_PATHS } from '../SPA_ROUTE_CONTRACT';

const read = (p: string) => readFileSync(fileURLToPath(new URL(`../${p}`, import.meta.url)), 'utf8');

const TOOL_EVENTS = [
  'tool_opened',
  'calculation_completed',
  'calculation_error',
  'registration_cta_clicked',
  'job_portal_cta_clicked',
] as const;

test.describe('PB-ANDROID-PLAYSTORE-001 channel detection', () => {
  test('query marker resolves to android_twa', () => {
    expect(resolveAppChannel({ search: `?t=branch-layout&${APP_CHANNEL_QUERY_PARAM}=android` })).toBe('android_twa');
    expect(resolveAppChannel({ search: `${APP_CHANNEL_QUERY_PARAM}=android` })).toBe('android_twa');
  });
  test('android-app referrer of our package resolves to android_twa; other packages do not', () => {
    expect(resolveAppChannel({ referrer: `android-app://${ANDROID_PACKAGE_ID}/https/pipingbox.com` })).toBe('android_twa');
    expect(resolveAppChannel({ referrer: 'android-app://com.example.other/' })).toBe('web');
  });
  test('sticky stored flag keeps android_twa across in-app navigation; defaults to web', () => {
    expect(resolveAppChannel({ stored: 'android_twa' })).toBe('android_twa');
    expect(resolveAppChannel({ stored: 'garbage' })).toBe('web');
    expect(resolveAppChannel({})).toBe('web');
    expect(resolveAppChannel({ search: `?${APP_CHANNEL_QUERY_PARAM}=ios` })).toBe('web');
  });
});

test.describe('PB-ANDROID-PLAYSTORE-001 analytics taxonomy', () => {
  test('tools funnel events are registered in the closed taxonomy', () => {
    for (const name of TOOL_EVENTS) expect(OBS_EVENT_NAMES).toContain(name);
  });
  test('TOOL_KEYS mirrors the keys declared in pages/Tools.tsx', () => {
    const source = read('app/frontend/src/pages/Tools.tsx');
    const declared = Array.from(source.matchAll(/key:\s*'([a-z-]+)'/g)).map((m) => m[1]);
    expect(declared.length).toBeGreaterThan(0);
    for (const key of declared) expect(TOOL_KEYS).toContain(key);
  });
  test('tool_key / error_category / cta_location only accept closed enum values', () => {
    for (const key of TOOL_KEYS) {
      expect(buildEventProps('tool_opened', { tool_key: key, route: '/tools' }).tool_key).toBe(key);
    }
    expect(buildEventProps('tool_opened', { tool_key: 'DN100 x 6.3', route: '/tools' }).tool_key).toBeUndefined();
    for (const c of CALCULATION_ERROR_CATEGORIES) {
      expect(buildEventProps('calculation_error', { tool_key: 'wall-thickness', error_category: c }).error_category).toBe(c);
    }
    expect(buildEventProps('calculation_error', { tool_key: 'wall-thickness', error_category: 'P=12.5 bar' }).error_category).toBeUndefined();
    for (const loc of CTA_LOCATIONS) {
      expect(buildEventProps('registration_cta_clicked', { cta_location: loc }).cta_location).toBe(loc);
    }
    expect(buildEventProps('job_portal_cta_clicked', { cta_location: 'https://x' }).cta_location).toBeUndefined();
  });
  test('inputs, results and identifiers never leave the app', () => {
    for (const name of TOOL_EVENTS) {
      const props = buildEventProps(name, {
        tool_key: 'flanges',
        route: '/tools',
        inputs: { dn: 100, pn: 16 },
        result: 6.3,
        value: 6.3,
        email: 'a@b.c',
        user_id: 'uuid',
        search: '?t=flanges&pb_app=android',
      });
      for (const forbidden of ['inputs', 'result', 'value', 'email', 'user_id', 'search']) {
        expect(props[forbidden], `${name}.${forbidden}`).toBeUndefined();
      }
    }
  });
});

test.describe('PB-ANDROID-PLAYSTORE-001 offline fallback worker', () => {
  test('registration is gated to the Android channel + SW API + secure context', () => {
    expect(shouldRegisterOfflineFallback(true, true, true)).toBe(true);
    expect(shouldRegisterOfflineFallback(false, true, true)).toBe(false);
    expect(shouldRegisterOfflineFallback(true, false, true)).toBe(false);
    expect(shouldRegisterOfflineFallback(true, true, false)).toBe(false);
  });
  test('sw.js is navigation-only and never caches app shell, bundles or version.json', () => {
    // Strip block comments: the contract is about code, not documentation.
    const sw = read('app/frontend/public/sw.js').replace(/\/\*[\s\S]*?\*\//g, '');
    expect(sw).toContain("event.request.mode !== 'navigate'");
    expect(sw).not.toMatch(/index\.html/);
    expect(sw).not.toMatch(/version\.json/);
    expect(sw).not.toMatch(/\/assets\/index|\.js'|\.css'/);
    expect(sw).toMatch(/cache\.addAll\(PRECACHE\)/);
    expect(sw).toMatch(/const PRECACHE = \[OFFLINE_URL, '\/assets\/favicons\/favicon-192\.png'\]/);
  });
  test('/offline.html is a declared static path in the SPA route contract', () => {
    expect(STATIC_WELL_KNOWN_PATHS).toContain('/offline.html');
    expect(STATIC_WELL_KNOWN_PATHS).toContain('/sw.js');
    expect(STATIC_WELL_KNOWN_PATHS).toContain('/.well-known/assetlinks.json');
  });
});

test.describe('PB-ANDROID-PLAYSTORE-001 TWA project contract', () => {
  const manifest = JSON.parse(read('android/twa/twa-manifest.json')) as Record<string, unknown>;
  test('package id, host and start URL are the agreed ones', () => {
    expect(manifest.packageId).toBe(ANDROID_PACKAGE_ID);
    expect(manifest.host).toBe('pipingbox.com');
    expect(String(manifest.startUrl)).toMatch(/^\/tools\?/);
    expect(String(manifest.startUrl)).toContain(`${APP_CHANNEL_QUERY_PARAM}=android`);
    for (const s of manifest.shortcuts as Array<{ url: string }>) {
      expect(s.url).toMatch(/^\/tools\?t=[a-z-]+&pb_app=android$/);
      const key = /t=([a-z-]+)/.exec(s.url)?.[1];
      expect(TOOL_KEYS).toContain(key);
    }
  });
  test('no notifications, zero declared permissions, portrait, minSdk 24', () => {
    expect(manifest.enableNotifications).toBe(false);
    expect(manifest.minSdkVersion).toBe(24);
    expect(manifest.orientation).toBe('portrait');
    const androidManifest = read('android/twa/app/src/main/AndroidManifest.xml');
    const permissions = Array.from(androidManifest.matchAll(/uses-permission[^>]*android:name="([^"]+)"/g)).map((m) => m[1]);
    // A TWA delegates all networking to the user's browser, so the app itself declares
    // no permission at all. The only entry in the merged manifest is the signature-level
    // DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION auto-generated by androidx.core.
    expect(permissions).toEqual([]);
  });
  test('signing material is git-ignored in android/twa', () => {
    const ignore = read('android/twa/.gitignore');
    for (const pattern of ['*.keystore', '*.jks', '*.pepk', '*.pass', 'keystore.properties', '*.aab']) {
      expect(ignore).toContain(pattern);
    }
  });
  test('Tools page hides the Stripe upgrade banner and unimplemented tools inside the app', () => {
    const source = read('app/frontend/src/pages/Tools.tsx');
    expect(source).toContain('const androidApp = isAndroidTwa();');
    expect(source).toContain('{!androidApp && !premiumStatus.isPremium && (');
    expect(source).toContain('TOOLS.filter((tool) => tool.implemented)');
  });
});
