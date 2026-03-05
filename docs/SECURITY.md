# ZERA Confidential SDK -- Security

Security model, threat analysis, audit requirements, and responsible disclosure policy for the ZERA privacy protocol.

## Table of Contents

1. [Security Model](#security-model)
2. [Threat Analysis](#threat-analysis)
3. [Cryptographic Assumptions](#cryptographic-assumptions)
4. [On-Chain Security Properties](#on-chain-security-properties)
5. [Client-Side Security](#client-side-security)
6. [Known Limitations](#known-limitations)
7. [Audit Status and Requirements](#audit-status-and-requirements)
8. [Responsible Disclosure Policy](#responsible-disclosure-policy)

---

## Security Model

The ZERA protocol provides the following security guarantees:

| Property | Guarantee | Mechanism |
|---|---|---|
| **Confidentiality** | Observers cannot link deposits to withdrawals | ZK proofs reveal no information about which note is being spent |
| **Ownership** | Only the note creator can spend a note | Spending requires knowledge of the `secret` (248-bit random value) |
| **Non-replayability** | Each note can be spent exactly once | Nullifier PDA creation fails on duplicate (Solana runtime enforcement) |
| **Solvency** | The pool always holds sufficient tokens | Transfer circuit enforces value conservation; deposit/withdraw amounts match SPL transfers |
| **Integrity** | Only valid notes can be spent | Merkle proof verifies the note's commitment exists in the on-chain tree |
| **Recipient binding** | Withdrawal proofs cannot be redirected | Recipient public key is bound in the proof as a public input |
| **Fee binding** | Relay operator fees cannot be inflated | Fee is committed as a public input in the relayed withdrawal proof |

### What ZERA Does NOT Protect Against

- **Deposit/withdrawal timing analysis**: An observer can see when deposits and withdrawals occur. Correlating amounts and timing may reduce the effective anonymity set.
- **Amount analysis**: Deposit and withdrawal amounts are public. If unique amounts are used, they can be correlated.
- **Metadata leakage**: The depositor's wallet address, the recipient's wallet address, and transaction timing are visible on-chain.
- **Compromised client**: If the user's device is compromised, note secrets can be extracted.

---

## Threat Analysis

### T1: Double-Spend Attack

**Threat:** An attacker attempts to spend the same note twice.

**Mitigation:** Each spend reveals a deterministic nullifier `Poseidon(secret, commitment)`. The nullifier is recorded as a PDA at `["nullifier", hash_bytes]`. Solana's runtime atomically rejects duplicate PDA creation. No additional checks are needed.

**Residual risk:** None. This is enforced at the Solana runtime level.

### T2: Fake Merkle Root

**Threat:** An attacker submits a proof against a fabricated Merkle root that includes a commitment they created but never deposited.

**Mitigation:** The on-chain program maintains a ring buffer of the last 100 valid roots. The `is_known_root` check rejects any root not in the current root or the history buffer. An attacker cannot inject a root without executing a valid deposit or transfer transaction.

**Residual risk:** None, assuming the `merkle_tree` PDA is not writable by unauthorized parties (enforced by Anchor's `seeds` constraint).

### T3: Front-Running Withdrawals

**Threat:** A miner/validator observes a withdrawal transaction in the mempool and front-runs it to steal the funds.

**Mitigation:** The withdrawal proof binds to a specific `recipient` (the recipient's public key hashed to a field element). The on-chain program verifies the recipient hash matches the actual recipient account. A front-runner would need to generate a new valid proof, which requires the note's secret.

**Residual risk:** None, assuming the ZK proof system is sound.

### T4: Relay Fee Manipulation

**Threat:** A relay operator inflates the fee between receiving the user's proof and submitting the transaction.

**Mitigation:** The fee is a public input in the relayed withdrawal circuit. Changing the fee would invalidate the proof. The on-chain program verifies the fee in the instruction matches the fee committed in the proof.

**Residual risk:** None.

### T5: Value Inflation (Transfer)

**Threat:** An attacker creates output notes whose total amount exceeds the input note's amount.

**Mitigation:** The transfer circuit enforces `inAmount === outAmount1 + outAmount2` as an arithmetic constraint. All three amounts are range-checked to 64 bits (via `Num2Bits(64)`) to prevent field-wrap attacks where a negative amount is represented as a large field element.

**Residual risk:** None, assuming the circuit is correctly constrained.

### T6: Asset Substitution

**Threat:** An attacker deposits token A but withdraws token B.

**Mitigation:** The `asset` field (token mint hash) is a public input in deposit and withdrawal proofs. The on-chain program verifies the asset hash matches the pool's configured token mint. The transfer circuit enforces asset consistency across input and output notes.

**Residual risk:** None.

### T7: Trusted Setup Compromise

**Threat:** If the toxic waste (tau) from the Groth16 trusted setup is known, an attacker can forge proofs for arbitrary statements, enabling theft of all pool funds.

**Mitigation:** Production deployments must use a multi-party computation (MPC) ceremony. The security guarantee is that as long as at least one participant honestly destroys their contribution, the setup is secure.

**Residual risk:** If ALL ceremony participants collude or their entropy is compromised, proofs can be forged. This is a fundamental limitation of Groth16.

### T8: Compromised Circuit Files

**Threat:** An attacker serves modified `.wasm` or `.zkey` files to the user. A malicious `.wasm` could extract the witness (including the secret) and exfiltrate it.

**Mitigation for production:**
- Serve circuit files from a CDN with Subresource Integrity (SRI) hashes
- Pin expected file hashes in the frontend code
- Bundle circuits within the application
- Use content-addressable storage (e.g., IPFS)

**Residual risk:** Without SRI or hash verification, this is a real attack vector.

### T9: Note Secret Theft

**Threat:** An attacker gains access to stored note secrets (e.g., via XSS, malicious browser extension, physical device access).

**Mitigation for production:**
- Encrypt notes at rest using a user-provided password (AES-GCM via WebCrypto)
- Consider hardware wallet-derived encryption keys
- Implement session timeouts for decrypted note access
- Never transmit note secrets to any server

**Residual risk:** If the encryption key is weak or compromised, all notes are exposed.

### T10: Gas-Based Wallet Linking

**Threat:** The wallet that pays gas for a withdrawal can be linked to the withdrawal, partially de-anonymizing the user.

**Mitigation:** The relayed withdrawal mechanism allows a third-party operator to submit the transaction. The user never needs to interact with Solana directly for withdrawals.

**Residual risk:** If the user uses a direct withdrawal (non-relayed), the gas-paying wallet is visible on-chain.

---

## Cryptographic Assumptions

The security of ZERA rests on the following hardness assumptions:

### 1. Discrete Logarithm on BN254

The BN254 elliptic curve group is assumed to satisfy the computational co-Diffie-Hellman (co-CDH) assumption in the bilinear group setting. This underpins the soundness of Groth16 proofs.

**Current status:** BN254 provides approximately 100 bits of security against discrete logarithm attacks. While this is below the 128-bit target recommended by NIST, it remains widely used in production ZK systems. The NFS (Number Field Sieve) attack complexity for BN254 is estimated at 2^100 operations.

### 2. Poseidon Collision Resistance

Poseidon is assumed to be collision-resistant over the BN254 scalar field. This underpins:
- Commitment binding (cannot find two notes with the same commitment)
- Nullifier uniqueness (cannot find two different secrets producing the same nullifier)
- Merkle tree integrity (cannot create a valid proof for a non-existent leaf)

**Current status:** Poseidon has been analyzed extensively in the academic literature. No practical attacks are known for the parameter sets used by circomlib. However, Poseidon is relatively new compared to SHA-256 and has received less cryptanalytic attention.

### 3. Poseidon Preimage Resistance

The commitment scheme requires that given `commitment = Poseidon(amount, secret, blinding, asset, memo[0..3])`, an attacker cannot recover the inputs. The 496 bits of randomness from `secret` and `blinding` ensure this.

### 4. Knowledge of Exponent Assumption (KEA)

Groth16 soundness requires the Knowledge of Exponent assumption in bilinear groups. This is a non-falsifiable assumption that is stronger than standard computational assumptions.

### 5. Random Oracle Model (for Fiat-Shamir)

snarkjs uses the Fiat-Shamir heuristic to make proofs non-interactive. This assumes the hash function used behaves as a random oracle.

---

## On-Chain Security Properties

### Account Authority

| Account | Authority | Protection |
|---|---|---|
| `MerkleTreeState` | PDA `["merkle_tree"]` | Only writeable by the program via PDA seeds |
| `PoolConfig` | PDA `["pool_config"]` | Only modifiable by the program; admin operations require `authority` signer |
| `Vault` | Owned by `PoolConfig` PDA | Transfers require PDA signature (`CpiContext::new_with_signer`) |
| `FeeVault` | Owned by `PoolConfig` PDA | Same PDA authority as vault |
| `NullifierPDA` | PDA `["nullifier", hash]` | Created once (init), existence = spent |

### Compute Budget

Groth16 verification consumes approximately 200,000 compute units. All ZK instructions set a 500,000 CU budget to provide headroom for CPI calls (SPL token transfers, PDA creation).

If the compute budget is insufficient, the transaction will fail with a `ComputationalBudgetExceeded` error. The 500K budget has been tested to be sufficient for all current operations.

### Root History Safety

The root history buffer holds 100 entries. This means:
- Up to 100 concurrent insertions can occur between proof generation and submission
- Under normal load (< 100 deposits per proof-submission window), this is sufficient
- Under extreme load, proofs may expire and need regeneration

The buffer is initialized with the empty tree root to prevent acceptance of the all-zeros root.

### Integer Overflow Protection

All arithmetic operations use Rust's `checked_*` methods:
- `checked_add`, `checked_sub`, `checked_mul` for fee and balance calculations
- Overflow returns the `ZeraError::Overflow` error
- 128-bit intermediate values are used for fee calculations to prevent overflow

---

## Client-Side Security

### Note Secret Generation

Note secrets are generated using cryptographically secure random number generators:
- **Browser:** `crypto.getRandomValues()` (WebCrypto API)
- **Node.js:** `crypto.randomBytes()` or `globalThis.crypto.getRandomValues()`

The SDK generates 31 bytes (248 bits) of randomness, which is reduced modulo the BN254 scalar field prime. This provides at least 247 bits of entropy (the modular reduction bias is negligible).

### Proof Generation Timing

Groth16 proof generation via snarkjs WASM takes 2-10 seconds depending on circuit complexity and device performance. During this time, the witness (including the note secret) is held in memory.

**Recommendation:** Proof generation should happen in a Web Worker to avoid blocking the main thread and to isolate the witness data.

### Field Element Handling

All field elements must be less than the BN254 scalar field prime. The SDK handles this automatically via modular reduction, but integrators building custom logic should verify inputs are in range.

---

## Known Limitations

### 1. Single-Asset Pool

Each pool instance supports one SPL token. This limits the anonymity set to users of that specific token. Multi-asset support would require additional circuit complexity.

### 2. Anonymity Set Size

The effective anonymity set is bounded by the number of active deposits. With few deposits, statistical analysis (timing, amounts, deposit/withdrawal patterns) can narrow the set of possible depositors for a given withdrawal.

### 3. Fixed Merkle Tree Height

The tree height is fixed at 24 (16M leaves) at pool initialization. There is no mechanism to extend the tree. Once full, a new pool must be deployed.

### 4. No Encrypted Note Emission

The `encrypted_note` field in deposit and transfer events is currently empty. Recipients of shielded transfers must receive note data out-of-band. This limits usability for asynchronous transfers.

### 5. No Viewing Keys

There is no mechanism for third-party auditors or compliance officers to view transaction details without the note secrets. This may present regulatory challenges in some jurisdictions.

### 6. BN254 Security Level

BN254 provides approximately 100 bits of security, below the 128-bit target. While no practical attacks exist today, the security margin is tighter than newer curves (e.g., BLS12-381 at ~120 bits). The choice of BN254 is driven by Solana's native `sol_poseidon` syscall support.

### 7. Proof Size and Verification Cost

Each Groth16 proof requires 256 bytes of instruction data and ~200K compute units for verification. Transactions with proofs consume more blockspace and CU than standard SPL transfers.

---

## Audit Status and Requirements

### Current Status

**The ZERA protocol has not yet undergone a formal security audit.** The codebase is in active development and should be treated as experimental software.

### Recommended Audit Scope

Before any production deployment, the following components should be audited by qualified firms:

1. **ZK Circuits (Critical)**
   - All four Circom circuits (deposit, withdraw, relayed_withdraw, transfer)
   - Library components (commitment_hasher, nullifier_hasher, merkle_tree, range_check)
   - Verify no under-constrained signals
   - Verify public/private input classification is correct
   - Verify range checks prevent field-wrap attacks

2. **Solana Smart Contract (Critical)**
   - `zera-pool` Anchor program (all instructions)
   - PDA derivation and authority checks
   - Groth16 verification key correctness
   - Integer overflow protection
   - CPI authority validation

3. **Proof Format Transformation (High)**
   - `formatProofForSolana` implementation
   - Verify pi_a negation uses the correct prime (Fp, not Fr)
   - Verify pi_b coordinate ordering
   - Verify public input serialization (big-endian, correct ordering)

4. **Client SDK (Medium)**
   - Poseidon implementation consistency (circomlibjs vs. on-chain)
   - Random number generation quality
   - Merkle tree implementation correctness
   - Field element arithmetic (overflow, modular reduction)

5. **Trusted Setup Ceremony (Critical, pre-production)**
   - MPC ceremony design and execution
   - Verification of ceremony transcripts
   - Toxic waste disposal confirmation

### Recommended Auditors

Firms with ZK and Solana expertise:

- Trail of Bits (ZK + Solana)
- OtterSec (Solana-focused)
- Zellic (ZK circuits)
- Veridise (formal verification for Circom)
- ABDK Consulting (cryptographic review)

---

## Responsible Disclosure Policy

### Reporting Vulnerabilities

If you discover a security vulnerability in the ZERA protocol, SDK, or smart contracts:

1. **Do NOT** disclose the vulnerability publicly (including GitHub issues, social media, or forums).

2. **Email** security@zeralabs.io with:
   - A detailed description of the vulnerability
   - Steps to reproduce
   - Potential impact assessment
   - Suggested fix (if any)

3. **Encrypt** your report using the PGP key published at https://zeralabs.io/.well-known/security.txt

4. You will receive an acknowledgment within **48 hours** and a detailed response within **7 business days**.

### Scope

The following are in scope for responsible disclosure:

- Smart contract vulnerabilities (fund theft, griefing, denial of service)
- ZK circuit soundness issues (under-constrained signals, proof forgery)
- Client SDK vulnerabilities (secret leakage, incorrect proof generation)
- Proof format errors that could lead to successful forged proofs
- Cryptographic implementation errors

### Out of Scope

- Frontend UI/UX bugs (unless they lead to security issues)
- Social engineering attacks
- Physical device access attacks
- Denial of service via RPC spam
- Issues in third-party dependencies (report to the upstream project)

### Bug Bounty

A formal bug bounty program will be established prior to mainnet production launch. Details will be published at https://zeralabs.io/security.

### Safe Harbor

ZERA Labs will not pursue legal action against researchers who:
- Make a good-faith effort to comply with this policy
- Do not access or modify user funds
- Do not publicly disclose before a fix is available
- Provide sufficient detail for reproduction

---

## Security Best Practices for Integrators

1. **Never log note secrets.** The `secret` and `blinding` values, if leaked, allow anyone to spend the note.

2. **Validate circuit file integrity.** Verify `.wasm` and `.zkey` file hashes before loading them for proof generation.

3. **Use the compute budget.** Always include `ComputeBudgetProgram.setComputeUnitLimit({ units: 500_000 })` for ZK transactions.

4. **Handle stale proofs.** If a proof fails with `InvalidRoot`, rebuild the Merkle tree and regenerate the proof.

5. **Encrypt notes at rest.** In production, encrypt stored notes with a user-derived key.

6. **Use relayed withdrawals.** To maximize privacy, use the relayed withdrawal mechanism to avoid linking gas-paying wallets to withdrawals.

7. **Monitor the anonymity set.** Track the number of active deposits to assess the privacy level. Warn users if the set is small.

8. **Keep dependencies updated.** Regularly update `circomlibjs`, `snarkjs`, `@solana/web3.js`, and `@coral-xyz/anchor` for security patches.
