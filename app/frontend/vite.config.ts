import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';
import path from 'path';
import { viteSourceLocator } from '@metagptx/vite-plugin-source-locator';
import { atoms } from '@metagptx/web-sdk/plugins';
import { vitePrerenderPlugin } from 'vite-prerender-plugin';
import Sitemap from 'vite-plugin-sitemap';
import { getBlogRoutes } from './prerender/blog-routes.js';
import { getSitemapLastmod } from './prerender/blog-sitemap.js';

function escapeHtmlAttr(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

process.env.VITE_APP_TITLE ??= 'PipingBox - Industrial Workforce Platform';
process.env.VITE_APP_DESCRIPTION ??= 'Formación, herramientas, empleo, certificaciones y comunidad para profesionales y empresas del sector industrial.';
process.env.VITE_APP_TITLE = escapeHtmlAttr(process.env.VITE_APP_TITLE);
process.env.VITE_APP_DESCRIPTION = escapeHtmlAttr(process.env.VITE_APP_DESCRIPTION);
process.env.VITE_APP_LOGO_URL ??= '/assets/logos/logo-icon.png';

// https://vitejs.dev/config/
export default defineConfig(({ command }) => {
  const blogPrerenderRoutes = command === 'build' ? getBlogRoutes() : [];

  return {
    plugins: [
      viteSourceLocator({
        prefix: 'mgx', // Prefix used to identify source locations; do not change.
      }),
      react(),
      atoms(),
      Sitemap({
        hostname: 'https://pipingbox.com',
        lastmod: getSitemapLastmod(),
        readable: true,
        // generateRobotsTxt disabled: we manage robots.txt in public/robots.txt directly
        // so it can include Disallow directives for private routes (PB-WEB-006).
        generateRobotsTxt: false,
        // PB-WEB-006: all public routes approved in PB-WEB-005 (F1 + F2).
        // vite-plugin-sitemap 0.8.2 uses dynamicRoutes, not routes.
        // PB-SEO-101: legal/contact/certification routes added.
        // vite-plugin-sitemap 0.8.2 builds the route list as
        // (scan of **\/\*.html in dist) + dynamicRoutes with NO dedup, and it
        // normalizes every route to the slash-less form. '/' and the blog
        // pages are already emitted by the dist scan (prerendered HTML), so
        // listing them here would duplicate <url> entries — they are covered
        // as long as vite-prerender-plugin emits their HTML, which is
        // load-bearing for the blog anyway.
        // Known follow-up (not this ticket): the plugin strips trailing
        // slashes, so sitemap URLs ('/blog') differ from the canonical
        // trailing-slash URLs ('/blog/'), and per-route lastmod from
        // getSitemapLastmod() never matches the normalized routes. Fixing
        // both means replacing this plugin with explicit sitemap generation.
        dynamicRoutes: [
          '/tools',
          '/academy',
          '/jobs',
          '/pricing',
          '/companies',
          '/companies/request-workers',
          '/contact',
          '/privacy',
          '/terms',
          '/dsa',
          '/certifications',
          '/certifications/vca',
          '/certifications/scc',
          '/certifications/prl',
        ],
      }),
      ...(blogPrerenderRoutes.length > 0
        ? vitePrerenderPlugin({
            renderTarget: '#root',
            prerenderScript: path.resolve(__dirname, 'prerender/blog.js'),
            additionalPrerenderRoutes: blogPrerenderRoutes,
          })
        : []),
      {
        // PB-OBSERVABILITY-001: vite-prerender-plugin (post, above) force-sets
        // build.sourcemap = true "for actionable error messages", which leaks
        // `//# sourceMappingURL=` into every shipped bundle (public maps).
        // Re-enforce 'hidden' AFTER it: maps are still generated for CI upload
        // to PostHog (error tracking per SHA) but never publicly linked.
        name: 'pb-enforce-hidden-sourcemaps',
        apply: 'build',
        enforce: 'post',
        config(config) {
          config.build ??= {};
          config.build.sourcemap = 'hidden';
        },
      },
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    server: {
      host: '0.0.0.0', // Listen on all network interfaces.
      port: parseInt(process.env.VITE_PORT || '3000'),
      proxy: {
        '/api': {
          target: `http://localhost:8000`,
          changeOrigin: true,
        },
      },
      watch: { usePolling: true, interval: 600 },
    },
    build: {
      // PB-OBSERVABILITY-001: hidden sourcemaps per build so error stacks can be
      // resolved per SHA in PostHog error tracking without shipping public maps.
      sourcemap: 'hidden',
      rollupOptions: {
        output: {
          manualChunks: {
            // Vendor chunks
            'react-vendor': ['react', 'react-dom'],
            'router-vendor': ['react-router-dom'],
            'ui-vendor': [
              '@radix-ui/react-accordion',
              '@radix-ui/react-alert-dialog',
              '@radix-ui/react-aspect-ratio',
              '@radix-ui/react-avatar',
              '@radix-ui/react-checkbox',
              '@radix-ui/react-collapsible',
              '@radix-ui/react-context-menu',
              '@radix-ui/react-dialog',
              '@radix-ui/react-dropdown-menu',
              '@radix-ui/react-hover-card',
              '@radix-ui/react-label',
              '@radix-ui/react-menubar',
              '@radix-ui/react-navigation-menu',
              '@radix-ui/react-popover',
              '@radix-ui/react-progress',
              '@radix-ui/react-radio-group',
              '@radix-ui/react-scroll-area',
              '@radix-ui/react-select',
              '@radix-ui/react-separator',
              '@radix-ui/react-slider',
              '@radix-ui/react-slot',
              '@radix-ui/react-switch',
              '@radix-ui/react-tabs',
              '@radix-ui/react-toast',
              '@radix-ui/react-toggle',
              '@radix-ui/react-toggle-group',
              '@radix-ui/react-tooltip',
            ],
            'form-vendor': ['react-hook-form', '@hookform/resolvers', 'zod'],
            'utils-vendor': [
              'axios',
              'clsx',
              'tailwind-merge',
              'class-variance-authority',
              'date-fns',
              'lucide-react',
            ],
            'query-vendor': ['@tanstack/react-query'],
          },
        },
      },
      chunkSizeWarningLimit: 1000,
    },
  };
});
