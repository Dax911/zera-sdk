# Contributing to ZERA SDK

Thanks for your interest in contributing to ZERA. This guide covers development setup, conventions, and the pull request process.

## Development Setup

### Prerequisites

- Node.js >= 18
- pnpm >= 9
- Rust >= 1.75
- Solana CLI >= 1.18 (for on-chain interaction)

### Getting Started

```bash
git clone https://github.com/Zera-Labs/zera-sdk.git
cd zera-sdk

# Install TypeScript dependencies
pnpm install

# Build everything
pnpm build

# Run TypeScript tests
pnpm test

# Run Rust tests
cargo test
```

## Repository Structure

```
crates/
  zera-core/       Rust cryptographic primitives
  zera-neon/       Node.js native bindings (napi-rs)
packages/
  sdk/             TypeScript client SDK
  mcp-server/      MCP server for AI agents
docs/              Architecture and integration docs
```

## Making Changes

1. **Fork** the repository and create a feature branch from `main`.
2. **Write tests** for any new functionality.
3. **Run the full test suite** before submitting:
   ```bash
   pnpm test && cargo test
   ```
4. **Build** to check for type errors:
   ```bash
   pnpm --filter @zera-labs/sdk build && cargo check
   ```
5. **Keep commits focused** -- one logical change per commit.

## Code Style

- **TypeScript**: Strict mode, no `any` types in public APIs. Format with the project's existing style.
- **Rust**: Follow standard `rustfmt` conventions. Run `cargo clippy` before submitting.
- **Tests**: Co-locate test files with source files (e.g., `note.ts` / `note.test.ts`).

## Pull Request Process

1. Open a PR against `main` with a clear title and description.
2. Reference any related issues.
3. Ensure all CI checks pass.
4. A maintainer will review your PR. Address any feedback.

## Security Vulnerabilities

Do **not** open a public issue for security vulnerabilities. See [SECURITY.md](docs/SECURITY.md) for responsible disclosure instructions.

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE).
