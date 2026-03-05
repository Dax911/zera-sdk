# ZERA Confidential SDK - Current State Analysis

**Date:** March 5, 2026
**Author:** dax
**Status:** Pre-release / Internal

---

## Executive Summary

The ZERA Confidential SDK consolidates privacy primitives from two production codebases into a unified, third-party-ready package. The cryptographic foundations are solid and functional on mainnet, but significant work remains before an external SDK release — particularly around auditing, documentation completeness, and developer experience.

**Bottom line:** The primitives exist and work. The SDK packaging, testing, and audit are what's needed before third-party consumption. Andreas's roadmap language ("on the roadmap for third-party integrations") is accurate and safe to post.

---

## What Exists Today

### 1. Shielded Pool (ai_mvp) — PRODUCTION
- **Program:** `B83jSQx1CT1hPRBupinaJaEkCjrfeo6Ktncu31q3ZNeX` (Solana mainnet)
- **Status:** Deployed and operational
- **Capabilities:**
  - Confidential USDC deposits with ZK proofs
  - Private withdrawals (standard + relayed/gasless)
  - Shielded transfers (1-to-2 note splits)
  - Protocol fees + ZERA burn mechanism
  - Merkle tree (height 24, capacity 16.7M notes)
- **Crypto stack:** Groth16/BN254, Poseidon hashing, Circom circuits
- **TypeScript SDK:** 7 modules (poseidon, note, merkle-tree, prover, utils, constants, index)
- **Documentation:** Comprehensive (architecture, circuits, crypto explainers, integration guide)

### 2. Private Cash / Wallet (zera-wallet-web) — PRODUCTION (v7.1.2)
- **Program:** `ESQxpH9XkBQT6EVeWwAzTZD1e9NrLMrY8RPQ9SidYsgF`
- **Status:** Deployed, WIP on backend/ZK components
- **Capabilities:**
  - Commitment-based voucher system (Keccak-256)
  - Deposit/withdraw with on-chain voucher accounts
  - Fee system (0.1% basis points)
  - Multi-wallet support (Phantom, Solflare, Backpack via Privy)
- **Crypto stack:** Keccak-256 (@noble/hashes), Ed25519 (tweetnacl)
- **Note:** Simpler privacy model than the shielded pool — no ZK proofs yet in wallet flow

### 3. Experimental Primitives (conglomerate/light-protocol)
- **Status:** Research/experimental
- **Available:**
  - Hasher trait abstractions (Poseidon, Keccak, SHA256)
  - Batched Merkle trees with ZK proof updates
  - Concurrent and indexed Merkle trees
  - Compressed account system
  - Batch Groth16 verifier (up to 1000 proofs)
  - Zero-copy serialization
- **Value:** Production-grade Rust primitives that can be pulled into the SDK

---

## SDK Readiness Matrix

| Component | Code Exists | Tests | Docs | Audit | SDK-Ready |
|-----------|:-----------:|:-----:|:----:|:-----:|:---------:|
| Poseidon hashing (TS) | YES | Partial | YES | NO | ~80% |
| Poseidon hashing (Rust) | YES | YES | Partial | NO | ~70% |
| Note creation/commitment | YES | Partial | YES | NO | ~80% |
| Nullifier computation | YES | Partial | YES | NO | ~80% |
| Merkle tree (TS) | YES | Partial | YES | NO | ~75% |
| Merkle tree (Rust, on-chain) | YES | YES | Partial | NO | ~70% |
| Groth16 proof generation | YES | YES | YES | NO | ~85% |
| Groth16 on-chain verifier | YES | YES | Partial | NO | ~75% |
| Circom circuits | YES | YES | YES | NO | ~85% |
| Transaction builders | YES | Partial | Partial | NO | ~60% |
| PDA derivation | YES | YES | Partial | NO | ~90% |
| Voucher system (Keccak) | YES | YES | Partial | NO | ~70% |
| Neon-RS Node bindings | NO | NO | NO | N/A | ~0% |
| npm package publishing | NO | NO | NO | N/A | ~0% |
| crates.io publishing | NO | NO | NO | N/A | ~0% |

---

## What Needs to Be Done

### Phase 1: SDK Consolidation (Current Sprint)
- [x] Extract primitives from ai_mvp and wallet-web
- [x] Create monorepo structure (Cargo workspace + pnpm workspace)
- [x] Write Rust core crate (zera-core)
- [x] Write TypeScript SDK package (@zera-labs/sdk)
- [x] Write initial documentation
- [ ] Integration tests covering all flows
- [ ] CI/CD pipeline (GitHub Actions)
- [ ] Neon-RS bindings compile and pass tests
- [ ] Example applications (deposit, withdraw, transfer)

### Phase 2: Developer Experience
- [ ] CLI tool for proof generation (`zera prove deposit ...`)
- [ ] Pre-compiled circuit artifacts hosted (WASM + zkey files)
- [ ] TypeDoc generated API docs
- [ ] Hosted documentation site
- [ ] npm publish pipeline
- [ ] crates.io publish pipeline
- [ ] Versioning strategy (semver)

### Phase 3: Audit & Hardening (Pat's concern — valid)
- [ ] **Smart contract audit** — Critical before inviting third-party builders
  - Shielded pool program (Anchor/Rust)
  - Circom circuits (deposit, withdraw, transfer, relayed_withdraw)
  - Groth16 verification keys
- [ ] **Cryptographic review**
  - Poseidon parameter selection
  - BN254 curve usage
  - Nullifier scheme soundness
- [ ] **SDK security review**
  - No secret leakage in proof generation
  - Proper randomness (CSPRNG)
  - Side-channel resistance considerations
- [ ] Formal verification of circuits (optional but strong signal)

### Phase 4: Agentic Integrations
- [ ] x402 payment protocol adapter
- [ ] MCP (Model Context Protocol) server
- [ ] Agent payment flow examples
- [ ] Relayer service for gasless withdrawals

---

## Gap Analysis vs. Competitors

### Privacy Cash (Tornado Cash fork ecosystem)
- **Their edge:** 14 audits, battle-tested on Ethereum, large anonymity set
- **Our edge:** Solana-native (faster, cheaper), USDC-specific, agentic payment flows
- **Gap:** Audit count. We need at least 1 reputable audit before SDK launch.

### Umbra (Stealth Addresses)
- **Their edge:** Simple UX (stealth addresses), EVM-native
- **Our edge:** Stronger privacy (full shielded pool vs stealth addresses), programmable
- **Gap:** UX simplicity. Our SDK needs to abstract ZK complexity.

### Light Protocol (Solana)
- **Their edge:** Compressed accounts, general-purpose ZK on Solana
- **Our edge:** Purpose-built for confidential payments, simpler API surface
- **Gap:** We're actually using some of their primitives. Relationship is complementary.

### Elusiv (Solana, defunct)
- **Their edge:** Was first Solana privacy protocol
- **Our edge:** Active development, broader vision (agentic payments)
- **Gap:** None — they're gone. But we should learn from their challenges.

---

## Risk Assessment

| Risk | Severity | Mitigation |
|------|----------|------------|
| No audit before SDK release | HIGH | Pat is right — get audit before inviting builders |
| Over-promising timeline | MEDIUM | Andreas's rephrased language is safe ("on the roadmap") |
| Circuit bugs | HIGH | Fuzzing + formal verification before release |
| Key management in SDK | MEDIUM | Clear docs on secret storage, no default local storage |
| Anonymity set too small | MEDIUM | Focus on USDC pools with high TVL |
| Regulatory uncertainty | HIGH | Legal review of privacy protocol in target jurisdictions |

---

## Recommendations

1. **Post is safe to publish** — "on the roadmap" with no timeline is accurate
2. **Don't mention "agentic flows" in detail** until we have a working demo (Rico's concern is valid)
3. **Prioritize audit** — even a single audit from a reputable firm (OtterSec, Neodyme, Halborn) unlocks credibility
4. **Ship SDK as "alpha" first** — clearly labeled, no stability guarantees, gather feedback
5. **Circuit artifacts** — host the .wasm and .zkey files; don't make developers compile Circom themselves
6. **Neon-RS bindings** — nice-to-have for v1, not blocking. Pure TypeScript SDK is sufficient for launch.

---

## Architecture: What the SDK Looks Like

```
@zera-labs/sdk (npm)
├── crypto/          Poseidon + Keccak hashing
├── note             Note creation, commitment, nullifier
├── merkle-tree      Client-side Merkle tree (mirrors on-chain)
├── prover           ZK proof generation (snarkjs wrapper)
├── tx/              Transaction builders (deposit, withdraw, transfer)
├── pda              PDA derivation helpers
├── voucher          Private Cash voucher management
├── constants        Program IDs, seeds, field constants
├── types            TypeScript interfaces
└── utils            Proof formatting, byte conversions

zera-core (crates.io)
├── poseidon         Poseidon hash (light-poseidon)
├── merkle           Incremental Merkle tree
├── note             Note/commitment/nullifier structs
├── verifier         Groth16 proof formatting
├── pda              PDA derivation
├── constants        Protocol constants
└── error            Error types

zera-neon (internal)
└── Node.js bindings via napi-rs (wraps zera-core)
```

---

## Token Distribution of Effort

| Area | Estimated % of Remaining Work |
|------|-------------------------------|
| Testing & CI | 25% |
| Audit preparation | 20% |
| Documentation polish | 15% |
| Neon-RS bindings | 10% |
| Example apps | 10% |
| CLI tooling | 5% |
| Publishing pipeline | 5% |
| Agentic integrations | 10% |

---

## Conclusion

The ZERA Confidential SDK has a strong cryptographic foundation already deployed on mainnet. The primary work remaining is **packaging** (making it consumable by third parties), **testing** (comprehensive coverage), and **auditing** (establishing trust).

Pat's caution about auditing is well-founded — no serious developer will build on unaudited privacy infrastructure. The recommended path is: ship alpha SDK now for internal/partner testing, pursue audit in parallel, and announce GA after audit completion.

Andreas's post language ("on the roadmap for third-party integrations across apps and agentic flows") is accurate and appropriately scoped. Ship it.
