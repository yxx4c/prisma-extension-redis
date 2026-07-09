# Contributing to prisma-extension-redis

Thank you for your interest in contributing to `prisma-extension-redis`! This document provides guidelines and information for contributors.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Setup](#development-setup)
- [Making Changes](#making-changes)
- [Testing](#testing)
- [Submitting Changes](#submitting-changes)
- [Issue Reporting](#issue-reporting)
- [Pull Request Process](#pull-request-process)

## Code of Conduct

This project follows the [Code of Conduct](CODE_OF_CONDUCT.md). By participating, you are expected to uphold this code.

## Getting Started

### Prerequisites

- Node.js 18+
- Bun (recommended) or npm/yarn/pnpm
- Redis or Dragonfly database
- Git

### Development Setup

1. **Fork the repository** on GitHub
2. **Clone your fork** locally:

   ```bash
   git clone https://github.com/your-username/prisma-extension-redis.git
   cd prisma-extension-redis
   ```

3. **Install dependencies**:

   ```bash
   bun install
   ```

4. **Set up the test database**:

   ```bash
   bun run pretest
   ```

5. **Run tests** to ensure everything is working:

   ```bash
   bun test
   ```

## Project Structure

```
src/
├── cacheKey.ts          # Cache key generation utilities
├── cacheUncache.ts      # Cache invalidation logic
├── index.ts             # Main exports
├── prismaExtensionRedis.ts # Main extension implementation
└── types.ts             # TypeScript type definitions

test/
├── unit/                # Unit tests
├── client.ts            # Test Prisma client setup
├── data.ts              # Test data
└── functions.ts         # Test helper functions
```

### Development Commands

```bash
# Run tests
bun test

# Run tests in watch mode
bun test --watch

# Run linting
bun run check

# Fix linting issues
bun run check:write

# Build the project
bun run build

# Development build with watch mode
bun run dev
```

## Making Changes

### Branch Naming

Use descriptive branch names:

- `feature/cache-pattern-matching`
- `bugfix/redis-connection-timeout`
- `docs/update-readme-examples`
- `perf/optimize-key-generation`

### Code Style

- Follow the existing code style
- Use TypeScript strict mode
- Add JSDoc comments for public APIs
- Use meaningful variable and function names
- Keep functions small and focused

### Commit Messages

Follow conventional commit format:

```
type(scope): description

[optional body]

[optional footer]
```

Types:

- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Code style changes (formatting, etc.)
- `refactor`: Code refactoring
- `test`: Adding or updating tests
- `chore`: Maintenance tasks

Examples:

```
feat(cache): add pattern matching for cache invalidation
fix(redis): handle connection timeout errors gracefully
docs(readme): update installation instructions
```

## Testing

### Running Tests

```bash
# Run all tests
bun test

# Run specific test file
bun test test/unit/cache-uncache-error.test.ts

# Run tests with coverage
bun test --coverage
```

### Writing Tests

- Write tests for new features
- Write tests for bug fixes
- Ensure tests are deterministic
- Use descriptive test names
- Test both success and error cases

### Test Structure

```typescript
import { expect, test } from 'bun:test';

test('description of what is being tested', async () => {
  // Arrange
  const input = 'test data';
  
  // Act
  const result = await functionUnderTest(input);
  
  // Assert
  expect(result).toBe('expected output');
});
```

## Submitting Changes

### Before Submitting

1. **Ensure tests pass**: `bun test`
2. **Check linting**: `bun run check`
3. **Build successfully**: `bun run build`
4. **Update documentation** if needed
5. **Add tests** for new functionality

### Pull Request Process

1. **Create a pull request** from your fork to the main repository
2. **Use the pull request template** provided
3. **Link related issues** using "Fixes #123" or "Closes #123"
4. **Provide a clear description** of changes
5. **Include screenshots** if UI changes are involved
6. **Request review** from maintainers

### Pull Request Guidelines

- Keep PRs focused and small when possible
- Include tests for new features
- Update documentation as needed
- Follow the existing code style
- Address review feedback promptly

## Issue Reporting

### Before Creating an Issue

1. **Search existing issues** to avoid duplicates
2. **Check the documentation** for solutions
3. **Try the latest version** to see if the issue is already fixed

### Using Issue Templates

We provide several issue templates:

- 🐛 **Bug Report**: For reporting bugs
- ✨ **Feature Request**: For suggesting new features
- ⚡ **Performance Issue**: For performance-related problems
- ⚙️ **Configuration Help**: For setup and configuration questions
- 📚 **Documentation Improvement**: For documentation suggestions
- ❓ **General Question**: For general questions

### Good Issue Reports Include

- Clear description of the problem
- Steps to reproduce
- Expected vs actual behavior
- Environment details (OS, Node.js version, etc.)
- Code examples
- Error messages (if any)

## Review Process

1. **Automated checks** must pass (tests, linting, build)
2. **Code review** by maintainers
3. **Address feedback** and make requested changes
4. **Approval** from at least one maintainer
5. **Merge** by maintainers

### After Merge

- **Delete your feature branch** after merge
- **Update your fork** with the latest changes
- **Celebrate** your contribution! 🎉

## Development Guidelines

### TypeScript

- Use strict TypeScript settings
- Define proper types for all functions
- Use interfaces for complex objects
- Avoid `any` type when possible

### Error Handling

- Handle errors gracefully
- Provide meaningful error messages
- Log errors appropriately
- Don't expose sensitive information

### Performance

- Consider performance implications
- Use efficient algorithms
- Minimize memory usage
- Test with realistic data sizes

### Security

- Validate all inputs
- Sanitize user data
- Follow security best practices
- Report security issues privately

## Getting Help

- **GitHub Discussions**: For questions and discussions
- **GitHub Issues**: For bug reports and feature requests
- **Stack Overflow**: For technical questions (use `prisma-extension-redis` tag)

## Recognition

Contributors will be recognized in:

- CONTRIBUTORS.md file
- Release notes
- GitHub contributor list

Thank you for contributing to `prisma-extension-redis`! 🚀
