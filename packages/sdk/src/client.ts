/**
 * ZeraClient – high-level wrapper over the ZERA shielded-pool SDK.
 *
 * Provides a simple interface for agents and developers to deposit, withdraw,
 * and transfer tokens in the privacy pool without manually managing Merkle
 * trees, ZK proofs, or Solana transaction construction.
 */

import { Connection, PublicKey, Transaction } from "@solana/web3.js";
import { SHIELDED_POOL_PROGRAM_ID } from "./constants";
import { MerkleTree } from "./merkle-tree";
import { createNote, computeCommitment, computeNullifier, hashPubkeyToField } from "./note";
import { generateDepositProof, generateWithdrawProof, generateTransferProof } from "./prover";
import { buildDepositTransaction, buildWithdrawTransaction, buildTransferTransaction } from "./tx";
import { formatPublicInputsForSolana } from "./utils";
import { TreeStateClient } from "./tree-state";
import { MemoryNoteStore } from "./note-store";
import type { NoteStore } from "./note-store";
import type { Note, StoredNote, SolanaProof } from "./types";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/** Circuit file paths for a single operation. */
export interface CircuitPaths {
  wasmPath: string;
  zkeyPath: string;
}

/** Configuration for the ZeraClient. */
export interface ZeraClientConfig {
  /** Solana RPC endpoint URL. */
  rpcUrl: string;
  /** Override the shielded-pool program ID (defaults to mainnet). */
  programId?: string;
  /** Paths to the ZK circuit files for each operation. */
  circuits: {
    deposit: CircuitPaths;
    withdraw: CircuitPaths;
    transfer: CircuitPaths;
  };
  /** Note storage backend (defaults to in-memory). */
  noteStore?: NoteStore;
  /** Optional cached API endpoint for tree-state fetches. */
  cacheEndpoint?: string;
}

// ---------------------------------------------------------------------------
// Result types
// ---------------------------------------------------------------------------

/** Result of a deposit operation. */
export interface DepositResult {
  /** The Solana transaction (unsigned). */
  transaction: Transaction;
  /** The newly created stored note. */
  note: StoredNote;
}

/** Result of a withdraw operation. */
export interface WithdrawResult {
  /** The Solana transaction (unsigned). */
  transaction: Transaction;
  /** The commitment of the note that was spent. */
  spentCommitment: bigint;
}

/** Result of a shielded transfer operation. */
export interface TransferResult {
  /** The Solana transaction (unsigned). */
  transaction: Transaction;
  /** The commitment of the consumed input note. */
  spentCommitment: bigint;
  /** The two new output notes stored in the note store. */
  outputNotes: [StoredNote, StoredNote];
}

// ---------------------------------------------------------------------------
// ZeraClient
// ---------------------------------------------------------------------------

/**
 * High-level client for the ZERA shielded pool protocol.
 *
 * Usage:
 * ```ts
 * const client = await ZeraClient.create({
 *   rpcUrl: "https://api.mainnet-beta.solana.com",
 *   circuits: {
 *     deposit:  { wasmPath: "./deposit.wasm",  zkeyPath: "./deposit.zkey" },
 *     withdraw: { wasmPath: "./withdraw.wasm", zkeyPath: "./withdraw.zkey" },
 *     transfer: { wasmPath: "./transfer.wasm", zkeyPath: "./transfer.zkey" },
 *   },
 * });
 *
 * // Sync the local Merkle tree from on-chain state
 * await client.syncTree();
 *
 * // Deposit 1 USDC (1_000_000 base units)
 * const { transaction, note } = await client.deposit(payer, mint, 1_000_000n, assetHash);
 * ```
 */
export class ZeraClient {
  private connection: Connection;
  private programId: PublicKey;
  private circuits: ZeraClientConfig["circuits"];
  private noteStore: NoteStore;
  private treeState: TreeStateClient;
  private tree: MerkleTree;

  private constructor(config: ZeraClientConfig, tree: MerkleTree) {
    this.connection = new Connection(config.rpcUrl, "confirmed");
    this.programId = new PublicKey(config.programId ?? SHIELDED_POOL_PROGRAM_ID);
    this.circuits = config.circuits;
    this.noteStore = config.noteStore ?? new MemoryNoteStore();
    this.treeState = new TreeStateClient({
      rpcUrl: config.rpcUrl,
      programId: config.programId,
      cacheEndpoint: config.cacheEndpoint,
    });
    this.tree = tree;
  }

  /**
   * Create and initialise a new ZeraClient.
   *
   * This async factory is required because the internal Merkle tree
   * must be initialised asynchronously (Poseidon empty-hash ladder).
   */
  static async create(config: ZeraClientConfig): Promise<ZeraClient> {
    const tree = await MerkleTree.create();
    return new ZeraClient(config, tree);
  }

  // -----------------------------------------------------------------------
  // Tree management
  // -----------------------------------------------------------------------

  /**
   * Sync the local Merkle tree with on-chain state.
   *
   * Fetches all leaves from the tree-state client (via cache endpoint
   * or on-chain event replay) and inserts any new leaves into the
   * local tree.
   *
   * @param forceFullRefresh - Re-fetch all leaves from scratch.
   */
  async syncTree(forceFullRefresh = false): Promise<void> {
    const leaves = await this.treeState.fetchAllLeaves(forceFullRefresh);

    // Insert only new leaves (the local tree already has `this.tree.leafCount` leaves)
    for (let i = this.tree.leafCount; i < leaves.length; i++) {
      await this.tree.insert(leaves[i]);
    }
  }

  /** Return the current local Merkle root. */
  getRoot(): bigint {
    return this.tree.getRoot();
  }

  /** Return the current leaf count in the local tree. */
  getLeafCount(): number {
    return this.tree.leafCount;
  }

  // -----------------------------------------------------------------------
  // Deposit
  // -----------------------------------------------------------------------

  /**
   * Prepare a shielded deposit.
   *
   * Creates a new note, generates a deposit proof, and builds the unsigned
   * Solana transaction. The note is saved to the note store.
   *
   * @param payer     - The depositor's wallet public key.
   * @param mint      - SPL token mint to deposit.
   * @param amount    - Token amount in base units.
   * @param assetHash - Asset field element (hashed mint).
   * @param memo      - Optional four-element private memo.
   * @returns The unsigned transaction and the stored note.
   */
  async deposit(
    payer: PublicKey,
    mint: PublicKey,
    amount: bigint,
    assetHash: bigint,
    memo?: [bigint, bigint, bigint, bigint],
  ): Promise<DepositResult> {
    // 1. Create note
    const note = createNote(amount, assetHash, memo);

    // 2. Generate proof
    const { wasmPath, zkeyPath } = this.circuits.deposit;
    const proofResult = await generateDepositProof(note, wasmPath, zkeyPath);

    // 3. Compute commitment and nullifier for storage
    const commitment = proofResult.commitment;
    const nullifier = await computeNullifier(note.secret, commitment);

    // 4. Insert commitment into local tree to get leaf index
    const leafIndex = await this.tree.insert(commitment);

    // 5. Build stored note
    const storedNote: StoredNote = {
      ...note,
      commitment,
      nullifier,
      leafIndex,
    };

    // 6. Save to note store
    await this.noteStore.save(storedNote);

    // 7. Build transaction
    const publicInputs = formatPublicInputsForSolana(proofResult.publicSignals);
    const transaction = buildDepositTransaction({
      payer,
      mint,
      amount,
      commitment,
      proof: proofResult.proof,
      publicInputs,
      programId: this.programId,
    });

    return { transaction, note: storedNote };
  }

  // -----------------------------------------------------------------------
  // Withdraw
  // -----------------------------------------------------------------------

  /**
   * Prepare a shielded withdrawal.
   *
   * Generates a withdraw proof for an existing note and builds the unsigned
   * Solana transaction. The note is marked as spent in the note store once
   * the caller records the transaction signature via
   * {@link confirmWithdraw}.
   *
   * @param commitment  - The commitment of the note to spend.
   * @param recipient   - The wallet receiving the tokens.
   * @param mint        - SPL token mint being withdrawn.
   * @returns The unsigned transaction and the spent commitment.
   */
  async withdraw(
    commitment: bigint,
    recipient: PublicKey,
    mint: PublicKey,
  ): Promise<WithdrawResult> {
    // 1. Look up the note
    const storedNote = await this.noteStore.getByCommitment(commitment);
    if (!storedNote) {
      throw new Error(`Note with commitment 0x${commitment.toString(16)} not found in store`);
    }

    // 2. Compute recipient hash for circuit binding
    const recipientHash = await hashPubkeyToField(recipient.toBytes());

    // 3. Generate proof
    const { wasmPath, zkeyPath } = this.circuits.withdraw;
    const proofResult = await generateWithdrawProof(
      storedNote,
      storedNote.leafIndex,
      this.tree,
      recipientHash,
      wasmPath,
      zkeyPath,
    );

    // 4. Build transaction
    const publicInputs = formatPublicInputsForSolana(proofResult.publicSignals);
    const transaction = buildWithdrawTransaction({
      payer: recipient,
      recipient,
      mint,
      amount: storedNote.amount,
      nullifierHash: proofResult.nullifierHash,
      root: this.tree.getRoot(),
      proof: proofResult.proof,
      publicInputs,
      programId: this.programId,
    });

    return { transaction, spentCommitment: commitment };
  }

  /**
   * Prepare a relayed (third-party-paid) withdrawal.
   *
   * Same as {@link withdraw}, but the `payer` (who pays gas) differs from
   * the `recipient` (who receives the tokens). Useful for relayer services
   * where the user does not hold SOL for fees.
   *
   * @param commitment  - The commitment of the note to spend.
   * @param payer       - The wallet paying transaction fees.
   * @param recipient   - The wallet receiving the tokens.
   * @param mint        - SPL token mint being withdrawn.
   * @returns The unsigned transaction and the spent commitment.
   */
  async relayedWithdraw(
    commitment: bigint,
    payer: PublicKey,
    recipient: PublicKey,
    mint: PublicKey,
  ): Promise<WithdrawResult> {
    // 1. Look up the note
    const storedNote = await this.noteStore.getByCommitment(commitment);
    if (!storedNote) {
      throw new Error(`Note with commitment 0x${commitment.toString(16)} not found in store`);
    }

    // 2. Compute recipient hash for circuit binding
    const recipientHash = await hashPubkeyToField(recipient.toBytes());

    // 3. Generate proof
    const { wasmPath, zkeyPath } = this.circuits.withdraw;
    const proofResult = await generateWithdrawProof(
      storedNote,
      storedNote.leafIndex,
      this.tree,
      recipientHash,
      wasmPath,
      zkeyPath,
    );

    // 4. Build transaction with separate payer
    const publicInputs = formatPublicInputsForSolana(proofResult.publicSignals);
    const transaction = buildWithdrawTransaction({
      payer,
      recipient,
      mint,
      amount: storedNote.amount,
      nullifierHash: proofResult.nullifierHash,
      root: this.tree.getRoot(),
      proof: proofResult.proof,
      publicInputs,
      programId: this.programId,
    });

    return { transaction, spentCommitment: commitment };
  }

  /**
   * Mark a withdrawal note as spent after the transaction has been confirmed.
   *
   * @param commitment - The commitment of the spent note.
   * @param txSig      - The confirmed Solana transaction signature.
   */
  async confirmWithdraw(commitment: bigint, txSig: string): Promise<void> {
    await this.noteStore.markSpent(commitment, txSig);
  }

  // -----------------------------------------------------------------------
  // Transfer
  // -----------------------------------------------------------------------

  /**
   * Prepare a shielded transfer (1 input -> 2 outputs).
   *
   * Splits the input note into two output notes: one for the payment
   * recipient and one for the sender's change. Both output notes are
   * stored in the note store.
   *
   * @param inputCommitment - Commitment of the note to spend.
   * @param sendAmount      - Amount to send (must be <= input note amount).
   * @param assetHash       - Asset field element (must match input note).
   * @param payer           - The wallet paying transaction fees.
   * @param memo1           - Optional memo for the payment output.
   * @param memo2           - Optional memo for the change output.
   * @returns The unsigned transaction, the spent commitment, and both output notes.
   */
  async transfer(
    inputCommitment: bigint,
    sendAmount: bigint,
    assetHash: bigint,
    payer: PublicKey,
    mint: PublicKey,
    memo1?: [bigint, bigint, bigint, bigint],
    memo2?: [bigint, bigint, bigint, bigint],
  ): Promise<TransferResult> {
    // 1. Look up the input note
    const inputNote = await this.noteStore.getByCommitment(inputCommitment);
    if (!inputNote) {
      throw new Error(`Note with commitment 0x${inputCommitment.toString(16)} not found in store`);
    }

    if (sendAmount > inputNote.amount) {
      throw new Error(
        `Insufficient note balance: sending ${sendAmount}, but note contains ${inputNote.amount}`,
      );
    }

    const changeAmount = inputNote.amount - sendAmount;

    // 2. Create output notes
    const outputNote1 = createNote(sendAmount, assetHash, memo1);
    const outputNote2 = createNote(changeAmount, assetHash, memo2);

    // 3. Generate proof
    const { wasmPath, zkeyPath } = this.circuits.transfer;
    const proofResult = await generateTransferProof(
      inputNote,
      inputNote.leafIndex,
      this.tree,
      outputNote1,
      outputNote2,
      wasmPath,
      zkeyPath,
    );

    // 4. Insert output commitments into local tree
    const leafIndex1 = await this.tree.insert(proofResult.outputCommitment1);
    const leafIndex2 = await this.tree.insert(proofResult.outputCommitment2);

    // 5. Compute nullifiers for the output notes
    const nullifier1 = await computeNullifier(outputNote1.secret, proofResult.outputCommitment1);
    const nullifier2 = await computeNullifier(outputNote2.secret, proofResult.outputCommitment2);

    // 6. Build stored output notes
    const storedOutput1: StoredNote = {
      ...outputNote1,
      commitment: proofResult.outputCommitment1,
      nullifier: nullifier1,
      leafIndex: leafIndex1,
    };
    const storedOutput2: StoredNote = {
      ...outputNote2,
      commitment: proofResult.outputCommitment2,
      nullifier: nullifier2,
      leafIndex: leafIndex2,
    };

    // 7. Save output notes
    await this.noteStore.save(storedOutput1);
    await this.noteStore.save(storedOutput2);

    // 8. Build transaction
    const publicInputs = formatPublicInputsForSolana(proofResult.publicSignals);
    const transaction = buildTransferTransaction({
      payer,
      mint,
      nullifierHash: proofResult.nullifierHash,
      outputCommitment1: proofResult.outputCommitment1,
      outputCommitment2: proofResult.outputCommitment2,
      root: this.tree.getRoot(),
      proof: proofResult.proof,
      publicInputs,
      programId: this.programId,
    });

    return {
      transaction,
      spentCommitment: inputCommitment,
      outputNotes: [storedOutput1, storedOutput2],
    };
  }

  /**
   * Mark a transfer's input note as spent after the transaction has been confirmed.
   *
   * @param commitment - The commitment of the spent input note.
   * @param txSig      - The confirmed Solana transaction signature.
   */
  async confirmTransfer(commitment: bigint, txSig: string): Promise<void> {
    await this.noteStore.markSpent(commitment, txSig);
  }

  // -----------------------------------------------------------------------
  // Balance
  // -----------------------------------------------------------------------

  /**
   * Get the total shielded balance (sum of all unspent note amounts).
   */
  async getBalance(): Promise<bigint> {
    return this.noteStore.getBalance();
  }

  /**
   * Get all unspent notes from the note store.
   */
  async getUnspentNotes(): Promise<StoredNote[]> {
    return this.noteStore.getUnspent();
  }

  // -----------------------------------------------------------------------
  // Accessors
  // -----------------------------------------------------------------------

  /** The underlying Solana connection. */
  getConnection(): Connection {
    return this.connection;
  }

  /** The underlying note store. */
  getNoteStore(): NoteStore {
    return this.noteStore;
  }

  /** The underlying tree state client. */
  getTreeStateClient(): TreeStateClient {
    return this.treeState;
  }

  /** The local Merkle tree instance. */
  getMerkleTree(): MerkleTree {
    return this.tree;
  }

  /** The program ID this client is targeting. */
  getProgramId(): PublicKey {
    return this.programId;
  }
}
