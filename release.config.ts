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
      "@amanda-mitchell/semantic-release-npm-multiple",
      {
        "registries": {
          "github": {},
          "public": {}
        }
      }
    ],
    "@semantic-release/github",
    "@semantic-release/git"
  ],
  preset: 'angular',
};
