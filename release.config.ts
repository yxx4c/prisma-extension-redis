/**
 * @type {import('semantic-release').GlobalConfig}
 */
export default {
  branches: [
    'main',
    'next',
    {name: 'beta', prerelease: true},
    {name: 'alpha', prerelease: true},
  ],
  plugins: [
    '@semantic-release/commit-analyzer',
    '@semantic-release/release-notes-generator',
    [
      '@semantic-release/changelog',
      {
        changelogFile: 'CHANGELOG.md',
      },
    ],

    [
      '@semantic-release/github',
      {
        assets: ['build.zip', 'build.tar.gz'],
      },
    ],
    [
      '@amanda-mitchell/semantic-release-npm-multiple',
      {
        registries: {
          github: {},
          public: {},
        },
        assets: [
          'dist/**',
          'package.json',
          'CHANGELOG.md',
          'LICENSE',
          'README.md',
        ],
      },
    ],
    '@semantic-release/git',
  ],
  preset: 'angular',
};