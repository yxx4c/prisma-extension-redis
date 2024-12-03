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
