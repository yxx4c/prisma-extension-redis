## [3.4.1](https://github.com/yxx4c/prisma-extension-redis/compare/v3.4.0...v3.4.1) (2025-10-06)


### Bug Fixes

* test release with runtime build-github generation ([c3d852b](https://github.com/yxx4c/prisma-extension-redis/commit/c3d852bec886197863a5fe5da10e3d3fdac1303b))

# [3.4.0](https://github.com/yxx4c/prisma-extension-redis/compare/v3.3.3...v3.4.0) (2025-10-06)


### Features

* test release with runtime build-github generation ([1216484](https://github.com/yxx4c/prisma-extension-redis/commit/121648490bfac67ef7d375c33aed4c12c9bd33bf))

## [3.3.3](https://github.com/yxx4c/prisma-extension-redis/compare/v3.3.2...v3.3.3) (2025-10-06)


### Bug Fixes

* update dual-publish configuration ([ef0f625](https://github.com/yxx4c/prisma-extension-redis/commit/ef0f62517021d33ab5dbdef56df790ddf4e2f32d))

## [3.3.2](https://github.com/yxx4c/prisma-extension-redis/compare/v3.3.1...v3.3.2) (2025-10-06)


### Bug Fixes

* use pkgRoot approach for GitHub Packages scoping ([17a4179](https://github.com/yxx4c/prisma-extension-redis/commit/17a417908abc0234258e47226e60173b057499fb))

## [3.3.1](https://github.com/yxx4c/prisma-extension-redis/compare/v3.3.0...v3.3.1) (2025-10-06)


### Bug Fixes

* add scoped package name for GitHub Packages ([042f382](https://github.com/yxx4c/prisma-extension-redis/commit/042f382358d05dd03c49550e6c50561753b90ed8))

# [3.3.0](https://github.com/yxx4c/prisma-extension-redis/compare/v3.2.0...v3.3.0) (2025-10-06)


### Features

* enable dual-publish to npm and GitHub Packages ([5880644](https://github.com/yxx4c/prisma-extension-redis/commit/58806440ceba1188251dbf6105f36e42645b83b3))

# [3.2.0](https://github.com/yxx4c/prisma-extension-redis/compare/v3.1.0...v3.2.0) (2025-10-06)


### Features

* enhance caching functionality with meta actions and improved type safety ([25bc57d](https://github.com/yxx4c/prisma-extension-redis/commit/25bc57dcde9469be096f0ddfdeaa48fd1b1c935a))

# [3.1.0](https://github.com/yxx4c/prisma-extension-redis/compare/v3.0.0...v3.1.0) (2024-12-03)


### Features

* **keywords:** update keywords for improved visibility and searchability ([4c66252](https://github.com/yxx4c/prisma-extension-redis/commit/4c66252b0f164afdbb66d103a5f88f6e6f4e54cf))

# [3.0.0](https://github.com/yxx4c/prisma-extension-redis/compare/v2.2.1...v3.0.0) (2024-12-03)


* feat(cacheContext)!: Cache Context and More BREAKING CHANGE: The addition of cache context creates breaking changes The response returned from prisma is now modified and returned as an object with the key result in it, which contains the actual result. ([d3a1061](https://github.com/yxx4c/prisma-extension-redis/commit/d3a1061f1e14fc860b040699e95ea11abab181d6))


### Bug Fixes

* **package.json:** update repository URL format to use git+https for consistency and compatibility ([998d98b](https://github.com/yxx4c/prisma-extension-redis/commit/998d98b19c90ba54bc4d7eb2e4b192b6bbf478a7))


### Features

* **cache:** change default cache case to SNAKE_CASE for consistency and better readability ([5885a75](https://github.com/yxx4c/prisma-extension-redis/commit/5885a7559f74302c87e72410f613cb9f65ca6530))
* **ci:** add CI/CD pipeline for automated dependency installation, building, and testing ([cb3e88c](https://github.com/yxx4c/prisma-extension-redis/commit/cb3e88cd99c8e7882ca6547840318308e691fd4c))
* **functions.ts:** add delay function to create a promise that resolves after a specified time ([9d07b4f](https://github.com/yxx4c/prisma-extension-redis/commit/9d07b4f57b7bb750b122e65bab2c01473ca0e15e))
* **workflow:** add alpha branch to GitHub Actions workflow for publishing ([9d5d2b4](https://github.com/yxx4c/prisma-extension-redis/commit/9d5d2b45e946ec1ee341134e7dcdbed347ad294f))


### BREAKING CHANGES

* The addition of cache context creates breaking changes
The response returned from prisma is now modified and returned as an
object with the key result in it, which contains the actual result.

- Additionally, this object contains the cache context such as
        isCached: Boolean; [True if data returned from cache, else false]

## [3.0.1](https://github.com/yxx4c/prisma-extension-redis/compare/v3.0.0...v3.0.1) (2024-12-03)


### Bug Fixes

* **package.json:** update repository URL format to use git+https for consistency and compatibility ([998d98b](https://github.com/yxx4c/prisma-extension-redis/commit/998d98b19c90ba54bc4d7eb2e4b192b6bbf478a7))

# [3.0.0](https://github.com/yxx4c/prisma-extension-redis/compare/v2.2.1...v3.0.0) (2024-12-03)


* feat(cacheContext)!: Cache Context and More BREAKING CHANGE: The addition of cache context creates breaking changes The response returned from prisma is now modified and returned as an object with the key result in it, which contains the actual result. ([d3a1061](https://github.com/yxx4c/prisma-extension-redis/commit/d3a1061f1e14fc860b040699e95ea11abab181d6))


### Features

* **cache:** change default cache case to SNAKE_CASE for consistency and better readability ([5885a75](https://github.com/yxx4c/prisma-extension-redis/commit/5885a7559f74302c87e72410f613cb9f65ca6530))
* **ci:** add CI/CD pipeline for automated dependency installation, building, and testing ([cb3e88c](https://github.com/yxx4c/prisma-extension-redis/commit/cb3e88cd99c8e7882ca6547840318308e691fd4c))
* **functions.ts:** add delay function to create a promise that resolves after a specified time ([9d07b4f](https://github.com/yxx4c/prisma-extension-redis/commit/9d07b4f57b7bb750b122e65bab2c01473ca0e15e))
* **workflow:** add alpha branch to GitHub Actions workflow for publishing ([9d5d2b4](https://github.com/yxx4c/prisma-extension-redis/commit/9d5d2b45e946ec1ee341134e7dcdbed347ad294f))


### BREAKING CHANGES

* The addition of cache context creates breaking changes
The response returned from prisma is now modified and returned as an
object with the key result in it, which contains the actual result.

- Additionally, this object contains the cache context such as
        isCached: Boolean; [True if data returned from cache, else false]
