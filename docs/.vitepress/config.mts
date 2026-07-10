import {defineConfig} from 'vitepress';

export default defineConfig({
  title: 'prisma-extension-redis',
  description:
    'Redis/Dragonfly caching for Prisma with zero runtime dependencies: auto-caching, write invalidation, stale-while-revalidate, and bring-your-own-client.',
  base: '/prisma-extension-redis/',
  lastUpdated: true,
  themeConfig: {
    nav: [
      {text: 'Guide', link: '/GETTING_STARTED'},
      {text: 'Assurance', link: '/ASSURANCE'},
      {
        text: 'npm',
        link: 'https://www.npmjs.com/package/prisma-extension-redis',
      },
    ],
    sidebar: [
      {
        text: 'Guide',
        items: [
          {text: 'Getting Started', link: '/GETTING_STARTED'},
          {text: 'Configuration Reference', link: '/CONFIGURATION'},
          {text: 'Bring Your Own Client', link: '/ADAPTERS'},
          {text: 'Meta Information', link: '/META_FEATURE'},
          {text: 'Monitoring & Observability', link: '/MONITORING'},
          {text: 'Cache Maintenance', link: '/MAINTENANCE'},
        ],
      },
      {
        text: 'Project',
        items: [
          {text: 'Migration Guide', link: '/MIGRATION'},
          {text: 'Assurance Report', link: '/ASSURANCE'},
          {text: 'Testing & Stress Harnesses', link: '/TESTING'},
          {
            text: 'Changelog',
            link: 'https://github.com/yxx4c/prisma-extension-redis/blob/main/CHANGELOG.md',
          },
        ],
      },
    ],
    socialLinks: [
      {icon: 'github', link: 'https://github.com/yxx4c/prisma-extension-redis'},
    ],
    search: {provider: 'local'},
    footer: {
      message: 'Released under the MIT License.',
    },
    outline: {level: [2, 3]},
  },
});
