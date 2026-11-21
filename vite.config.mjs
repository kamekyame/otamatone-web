import { defineConfig } from 'vite';

const site = process.env.SITE_URL ? new URL(process.env.SITE_URL) : undefined;
if (site) site.pathname = `${site.pathname.replace(/\/+$/, '')}/`;

export default defineConfig({
  base: site?.pathname ?? '/',
  build: {
    license: { fileName: 'THIRD_PARTY_NOTICES.md' },
  },
  plugins: site
    ? [
        {
          name: 'public-site-metadata',
          transformIndexHtml() {
            return [
              { tag: 'link', attrs: { rel: 'canonical', href: site.href } },
              {
                tag: 'meta',
                attrs: { property: 'og:url', content: site.href },
              },
            ];
          },
        },
      ]
    : [],
});
