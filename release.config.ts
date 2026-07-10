/**
 * @type {import('semantic-release').GlobalConfig}
 */
export default {
  branches: [
    'main',
    {name: 'next', prerelease: true},
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
      '@amanda-mitchell/semantic-release-npm-multiple',
      {
        registries: {
          github: {
            npmPublish: true,
            provenance: true,
            pkgRoot: 'dist-github',
            tarballDir: 'dist-archive',
          },
          public: {
            npmPublish: true,
            provenance: true,
            pkgRoot: 'dist-npm',
          },
        },
      },
    ],
    '@semantic-release/github',
    '@semantic-release/git',
  ],
  preset: 'angular',
};
