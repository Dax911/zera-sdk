/**
 * Tree State Client
 *
 * Fetches and caches the full Merkle tree state from the ZERA protocol.
 * Supports multiple backends:
 * - Direct on-chain RPC fetch (default)
 * - Cached API endpoint (for production use)
 * - IPFS/decentralized storage (future)
 */

import { Connection, PublicKey } from "@solana/web3.js";
import { Program } from "@coral-xyz/anchor";
import { SHIELDED_POOL_PROGRAM_ID, MERKLE_TREE_SEED, POOL_CONFIG_SEED, TREE_HEIGHT } from "./constants";
import type { MerkleTreeState, PoolState, LeafCache, TreeStateConfig } from "./types";

const DEFAULT_LEAF_CACHE_KEY = `zera-leaves-${SHIELDED_POOL_PROGRAM_ID}`;

/**
 * Client for fetching and managing ZERA Merkle tree state.
 * Handles incremental leaf syncing, caching, and tree reconstruction.
 */
export class TreeStateClient {
  private connection: Connection;
  private programId: PublicKey;
  private cacheEndpoint?: string;
  private ipfsGateway?: string;
  private leafCache: LeafCache | null = null;

  constructor(config: TreeStateConfig) {
    this.connection = new Connection(config.rpcUrl, "confirmed");
    this.programId = new PublicKey(config.programId ?? SHIELDED_POOL_PROGRAM_ID);
    this.cacheEndpoint = config.cacheEndpoint;
    this.ipfsGateway = config.ipfsGateway;
  }

  /**
   * Fetch the current pool state directly from on-chain accounts.
   */
  async fetchPoolState(): Promise<PoolState> {
    const [poolConfigPda] = PublicKey.findProgramAddressSync(
      [Buffer.from(POOL_CONFIG_SEED)],
      this.programId
    );
    const [merkleTreePda] = PublicKey.findProgramAddressSync(
      [Buffer.from(MERKLE_TREE_SEED)],
      this.programId
    );

    const [configInfo, treeInfo] = await Promise.all([
      this.connection.getAccountInfo(poolConfigPda),
      this.connection.getAccountInfo(merkleTreePda),
    ]);

    if (!configInfo || !treeInfo) {
      throw new Error("Pool or Merkle tree account not found on-chain");
    }

    return {
      poolConfig: this.parsePoolConfig(configInfo.data),
      merkleTree: this.parseMerkleTreeState(treeInfo.data),
    };
  }

  /**
   * Fetch tree state from a cached API endpoint.
   * Falls back to on-chain fetch if no endpoint configured.
   */
  async fetchCachedState(): Promise<PoolState> {
    if (!this.cacheEndpoint) {
      return this.fetchPoolState();
    }

    const response = await fetch(`${this.cacheEndpoint}/api/state`);
    if (!response.ok) {
      console.warn("Cache endpoint unavailable, falling back to on-chain fetch");
      return this.fetchPoolState();
    }

    return response.json() as Promise<PoolState>;
  }

  /**
   * Fetch all leaves (commitments) from the tree.
   * Uses incremental syncing — only fetches new leaves since last sync.
   *
   * @param forceFullRefresh - If true, re-fetches all leaves from scratch
   * @returns Array of commitment bigints in insertion order
   */
  async fetchAllLeaves(forceFullRefresh = false): Promise<bigint[]> {
    // Try cached endpoint first
    if (this.cacheEndpoint) {
      return this.fetchLeavesFromCache(forceFullRefresh);
    }

    // Fall back to on-chain event replay
    return this.fetchLeavesFromChain(forceFullRefresh);
  }

  /**
   * Fetch leaves from the cached API endpoint with incremental sync.
   */
  private async fetchLeavesFromCache(forceFullRefresh: boolean): Promise<bigint[]> {
    const since = forceFullRefresh ? 0 : (this.leafCache?.newestIndex ?? 0);
    const url = `${this.cacheEndpoint}/api/leaves?since=${since}`;
    const response = await fetch(url);

    if (!response.ok) {
      console.warn("Cache endpoint unavailable, falling back to on-chain");
      return this.fetchLeavesFromChain(forceFullRefresh);
    }

    const data = (await response.json()) as {
      leaves: Array<{ index: number; commitment: string }>;
      total: number;
    };

    // Merge with existing cache
    if (!this.leafCache || forceFullRefresh) {
      this.leafCache = { leaves: {}, newestIndex: 0, newestSig: "" };
    }

    for (const leaf of data.leaves) {
      this.leafCache.leaves[leaf.index.toString()] = leaf.commitment;
      if (leaf.index > this.leafCache.newestIndex) {
        this.leafCache.newestIndex = leaf.index;
      }
    }

    return this.cacheToOrderedLeaves();
  }

  /**
   * Fetch leaves from on-chain transaction logs (event replay).
   * Parses DepositEvent and TransferEvent from program logs.
   */
  private async fetchLeavesFromChain(forceFullRefresh: boolean): Promise<bigint[]> {
    if (!this.leafCache || forceFullRefresh) {
      this.leafCache = { leaves: {}, newestIndex: 0, newestSig: "" };
    }

    const signatures = await this.connection.getSignaturesForAddress(
      this.programId,
      this.leafCache.newestSig ? { until: this.leafCache.newestSig } : undefined,
      "confirmed"
    );

    // Process in chronological order (oldest first)
    const chronological = signatures.reverse();

    for (const sig of chronological) {
      const tx = await this.connection.getTransaction(sig.signature, {
        maxSupportedTransactionVersion: 0,
      });

      if (!tx?.meta?.logMessages) continue;

      // Parse Anchor events from logs
      for (const log of tx.meta.logMessages) {
        if (log.startsWith("Program data: ")) {
          const eventData = log.slice("Program data: ".length);
          const parsed = this.parseEvent(eventData);
          if (parsed) {
            for (const [index, commitment] of parsed) {
              this.leafCache.leaves[index.toString()] = commitment;
              if (index > this.leafCache.newestIndex) {
                this.leafCache.newestIndex = index;
              }
            }
          }
        }
      }

      this.leafCache.newestSig = sig.signature;
    }

    return this.cacheToOrderedLeaves();
  }

  /**
   * Convert leaf cache to ordered array of commitments.
   */
  private cacheToOrderedLeaves(): bigint[] {
    const leaves: bigint[] = [];
    for (let i = 0; i <= this.leafCache!.newestIndex; i++) {
      const commitment = this.leafCache!.leaves[i.toString()];
      if (commitment) {
        leaves.push(BigInt(commitment));
      }
    }
    return leaves;
  }

  /**
   * Parse an Anchor event from base64-encoded program log data.
   * Returns array of [leafIndex, commitment] pairs, or null if not a leaf event.
   */
  private parseEvent(base64Data: string): Array<[number, string]> | null {
    try {
      const data = Buffer.from(base64Data, "base64");
      // Anchor event discriminator is first 8 bytes
      const discriminator = data.subarray(0, 8).toString("hex");

      // DepositEvent discriminator
      if (discriminator === "e9a94c0028f4d15e") {
        const commitment = "0x" + data.subarray(8, 40).toString("hex");
        const leafIndex = Number(data.readBigUInt64LE(40));
        return [[leafIndex, commitment]];
      }

      // TransferEvent discriminator (produces 2 leaves)
      if (discriminator === "52f0b236c6e0fdf7") {
        const commitment1 = "0x" + data.subarray(40, 72).toString("hex");
        const commitment2 = "0x" + data.subarray(72, 104).toString("hex");
        const leafIndex1 = Number(data.readBigUInt64LE(104));
        const leafIndex2 = Number(data.readBigUInt64LE(112));
        return [
          [leafIndex1, commitment1],
          [leafIndex2, commitment2],
        ];
      }

      return null;
    } catch {
      return null;
    }
  }

  /**
   * Get the current Merkle root from on-chain state.
   */
  async getCurrentRoot(): Promise<Uint8Array> {
    const state = await this.fetchPoolState();
    return state.merkleTree.root;
  }

  /**
   * Get the current leaf count from on-chain state.
   */
  async getLeafCount(): Promise<number> {
    const state = await this.fetchPoolState();
    return Number(state.merkleTree.leafCount);
  }

  // --- Account Parsing Helpers ---

  private parsePoolConfig(data: Buffer): PoolState["poolConfig"] {
    // Skip 8-byte Anchor discriminator
    const offset = 8;
    return {
      authority: new PublicKey(data.subarray(offset, offset + 32)).toBase58(),
      merkleTree: new PublicKey(data.subarray(offset + 32, offset + 64)).toBase58(),
      tokenMint: new PublicKey(data.subarray(offset + 64, offset + 96)).toBase58(),
      vault: new PublicKey(data.subarray(offset + 96, offset + 128)).toBase58(),
      assetHash: data.subarray(offset + 128, offset + 160),
      totalDeposited: Number(data.readBigUInt64LE(offset + 160)),
      totalWithdrawn: Number(data.readBigUInt64LE(offset + 168)),
      bump: data[offset + 176],
      feeBps: data.readUInt16LE(offset + 177),
      burnBps: data.readUInt16LE(offset + 179),
      zeraPrice: Number(data.readBigUInt64LE(offset + 181)),
      paused: data[offset + 189] === 1,
    };
  }

  private parseMerkleTreeState(data: Buffer): MerkleTreeState {
    // Skip 8-byte Anchor discriminator
    const offset = 8;
    const root = new Uint8Array(data.subarray(offset + 32, offset + 64));
    const leafCount = Number(data.readBigUInt64LE(offset + 64));

    const filledSubtrees: Uint8Array[] = [];
    let pos = offset + 72;
    for (let i = 0; i < TREE_HEIGHT; i++) {
      filledSubtrees.push(new Uint8Array(data.subarray(pos, pos + 32)));
      pos += 32;
    }

    const emptyHashes: Uint8Array[] = [];
    for (let i = 0; i < TREE_HEIGHT; i++) {
      emptyHashes.push(new Uint8Array(data.subarray(pos, pos + 32)));
      pos += 32;
    }

    return {
      root,
      leafCount,
      filledSubtrees,
      emptyHashes,
    };
  }
}
