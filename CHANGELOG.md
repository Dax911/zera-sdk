# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-03-05

### Added

- **Core SDK** (`@zera-labs/sdk`)
  - Poseidon hashing (circomlibjs-compatible)
  - Keccak-256 hashing for voucher system
  - Shielded note creation, commitment, and nullifier computation
  - Incremental Merkle tree (height 24, 16M leaves)
  - ZK proof generation for deposit, withdraw, and transfer circuits
  - Transaction builders for all shielded pool operations
  - PDA derivation helpers for pool accounts
  - Voucher parsing, storage, and validation
  - `ZeraClient` high-level wrapper
  - `TreeStateClient` for on-chain Merkle tree sync
  - `NoteStore` with memory and encrypted file backends
- **Rust Core** (`zera-core`)
  - Poseidon hashing via `light-poseidon`
  - Merkle tree with proof generation
  - Note commitment and nullifier computation
  - Groth16 proof formatting for `groth16-solana`
  - PDA derivation (with optional `solana-program` feature)
- **Node Bindings** (`zera-neon`)
  - napi-rs bindings exposing `zera-core` to Node.js
- **MCP Server** (`@zera-labs/mcp-server`)
  - Model Context Protocol server for AI agent integration
  - Tools: deposit, transfer, withdraw, balance check
- **Documentation**
  - Architecture overview
  - Full API reference
  - Integration guide
  - Cryptography deep-dive
  - Security model and threat analysis
  - Agentic integration patterns
  - Use case catalog
