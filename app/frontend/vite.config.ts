import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';
import path from 'path';
import { viteSourceLocator } from '@metagptx/vite-plugin-source-locator';
import { atoms } from '@metagptx/web-sdk/plugins';
import { vitePrerenderPlugin } from 'vite-prerender-plugin';
import { pbExplicitSitemapPlugin } from './prerender/sitemap.js';
import { getBlogRoutes } from './prerender/blog-routes.js';

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
      // PB-OBSERVABILITY-PROD-ROLLOUT-001: vite-plugin-sitemap was removed.
      // It normalized every route to the slash-less form, so blog URLs were
      // emitted as their non-canonical variants (307 redirects). The
      // replacement generates the sitemap from the same route sources as the
      // router/prerenderer under a single canonical policy: '/' and blog
      // routes keep their trailing slash, app routes never have one.
      // Canonical route list and policy live in prerender/sitemap.js.
      pbExplicitSitemapPlugin(),
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
