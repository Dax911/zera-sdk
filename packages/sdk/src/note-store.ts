/**
 * Note storage interface and implementations.
 *
 * Provides a pluggable persistence layer for shielded notes so that agents
 * and wallets can track their private UTXOs across sessions.
 *
 * Two built-in backends:
 * - {@link MemoryNoteStore} – ephemeral, for testing and short-lived agents.
 * - {@link FileNoteStore} – encrypted JSON file (AES-256-GCM), for persistent storage.
 */

import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "crypto";
import { readFileSync, writeFileSync, existsSync } from "fs";
import type { StoredNote } from "./types";

// ---------------------------------------------------------------------------
// Serialisation helpers (bigint <-> hex string)
// ---------------------------------------------------------------------------

/** Shape of a StoredNote when serialised to JSON (bigints become hex strings). */
interface SerialisedNote {
  amount: string;
  asset: string;
  secret: string;
  blinding: string;
  memo: [string, string, string, string];
  commitment: string;
  nullifier: string;
  leafIndex: number;
  spent: boolean;
  spentTxSig?: string;
}

function noteToSerialised(note: StoredNote, spent: boolean, spentTxSig?: string): SerialisedNote {
  return {
    amount: "0x" + note.amount.toString(16),
    asset: "0x" + note.asset.toString(16),
    secret: "0x" + note.secret.toString(16),
    blinding: "0x" + note.blinding.toString(16),
    memo: note.memo.map((m) => "0x" + m.toString(16)) as [string, string, string, string],
    commitment: "0x" + note.commitment.toString(16),
    nullifier: "0x" + note.nullifier.toString(16),
    leafIndex: note.leafIndex,
    spent,
    spentTxSig,
  };
}

function serialisedToNote(s: SerialisedNote): StoredNote {
  return {
    amount: BigInt(s.amount),
    asset: BigInt(s.asset),
    secret: BigInt(s.secret),
    blinding: BigInt(s.blinding),
    memo: s.memo.map((m) => BigInt(m)) as [bigint, bigint, bigint, bigint],
    commitment: BigInt(s.commitment),
    nullifier: BigInt(s.nullifier),
    leafIndex: s.leafIndex,
  };
}

// ---------------------------------------------------------------------------
// NoteStore interface
// ---------------------------------------------------------------------------

/**
 * Abstract storage interface for shielded notes.
 *
 * Implementations must handle bigint values correctly and track
 * which notes have been spent.
 */
export interface NoteStore {
  /** Persist a new unspent note. */
  save(note: StoredNote): Promise<void>;

  /** Return all notes that have not been marked as spent. */
  getUnspent(): Promise<StoredNote[]>;

  /** Look up a single note by its Poseidon commitment. */
  getByCommitment(commitment: bigint): Promise<StoredNote | null>;

  /** Mark a note as spent, recording the transaction signature that consumed it. */
  markSpent(commitment: bigint, txSig: string): Promise<void>;

  /** Sum the amounts of all unspent notes. */
  getBalance(): Promise<bigint>;

  /** Return every stored note (spent and unspent). */
  getAll(): Promise<StoredNote[]>;
}

// ---------------------------------------------------------------------------
// MemoryNoteStore
// ---------------------------------------------------------------------------

/**
 * In-memory note store for testing and short-lived agent sessions.
 *
 * All data is lost when the process exits.
 */
export class MemoryNoteStore implements NoteStore {
  /** Notes keyed by commitment hex string. */
  private notes = new Map<string, { note: StoredNote; spent: boolean; spentTxSig?: string }>();

  async save(note: StoredNote): Promise<void> {
    const key = "0x" + note.commitment.toString(16);
    this.notes.set(key, { note, spent: false });
  }

  async getUnspent(): Promise<StoredNote[]> {
    const result: StoredNote[] = [];
    for (const entry of this.notes.values()) {
      if (!entry.spent) {
        result.push(entry.note);
      }
    }
    return result;
  }

  async getByCommitment(commitment: bigint): Promise<StoredNote | null> {
    const key = "0x" + commitment.toString(16);
    const entry = this.notes.get(key);
    return entry?.note ?? null;
  }

  async markSpent(commitment: bigint, txSig: string): Promise<void> {
    const key = "0x" + commitment.toString(16);
    const entry = this.notes.get(key);
    if (!entry) {
      throw new Error(`Note with commitment ${key} not found`);
    }
    entry.spent = true;
    entry.spentTxSig = txSig;
  }

  async getBalance(): Promise<bigint> {
    let total = 0n;
    for (const entry of this.notes.values()) {
      if (!entry.spent) {
        total += entry.note.amount;
      }
    }
    return total;
  }

  async getAll(): Promise<StoredNote[]> {
    return Array.from(this.notes.values()).map((e) => e.note);
  }
}

// ---------------------------------------------------------------------------
// FileNoteStore
// ---------------------------------------------------------------------------

/** Encryption parameters for the file store. */
const SCRYPT_KEY_LEN = 32; // AES-256
const SCRYPT_COST = 16384; // N
const SCRYPT_BLOCK_SIZE = 8; // r
const SCRYPT_PARALLELISM = 1; // p
const IV_LEN = 12; // AES-GCM nonce
const AUTH_TAG_LEN = 16; // AES-GCM auth tag
const SALT_LEN = 32;

/**
 * Encrypted JSON file-backed note store.
 *
 * Uses AES-256-GCM with a key derived from a user-supplied password via
 * scrypt. The file format is:
 *
 * ```
 * [32-byte salt][12-byte IV][16-byte auth tag][...ciphertext...]
 * ```
 *
 * All bigint values are serialised as `0x`-prefixed hex strings.
 */
export class FileNoteStore implements NoteStore {
  private filePath: string;
  private password: string;
  /** In-memory cache loaded on first access. */
  private cache: Map<string, SerialisedNote> | null = null;

  /**
   * @param filePath - Path to the encrypted JSON file.
   * @param password - Password used to derive the encryption key.
   */
  constructor(filePath: string, password: string) {
    this.filePath = filePath;
    this.password = password;
  }

  // -----------------------------------------------------------------------
  // NoteStore implementation
  // -----------------------------------------------------------------------

  async save(note: StoredNote): Promise<void> {
    const data = await this.load();
    const key = "0x" + note.commitment.toString(16);
    data.set(key, noteToSerialised(note, false));
    await this.flush(data);
  }

  async getUnspent(): Promise<StoredNote[]> {
    const data = await this.load();
    const result: StoredNote[] = [];
    for (const entry of data.values()) {
      if (!entry.spent) {
        result.push(serialisedToNote(entry));
      }
    }
    return result;
  }

  async getByCommitment(commitment: bigint): Promise<StoredNote | null> {
    const data = await this.load();
    const key = "0x" + commitment.toString(16);
    const entry = data.get(key);
    return entry ? serialisedToNote(entry) : null;
  }

  async markSpent(commitment: bigint, txSig: string): Promise<void> {
    const data = await this.load();
    const key = "0x" + commitment.toString(16);
    const entry = data.get(key);
    if (!entry) {
      throw new Error(`Note with commitment ${key} not found`);
    }
    entry.spent = true;
    entry.spentTxSig = txSig;
    await this.flush(data);
  }

  async getBalance(): Promise<bigint> {
    const data = await this.load();
    let total = 0n;
    for (const entry of data.values()) {
      if (!entry.spent) {
        total += BigInt(entry.amount);
      }
    }
    return total;
  }

  async getAll(): Promise<StoredNote[]> {
    const data = await this.load();
    return Array.from(data.values()).map(serialisedToNote);
  }

  // -----------------------------------------------------------------------
  // Encryption / Decryption
  // -----------------------------------------------------------------------

  private deriveKey(salt: Buffer): Buffer {
    return scryptSync(this.password, salt, SCRYPT_KEY_LEN, {
      N: SCRYPT_COST,
      r: SCRYPT_BLOCK_SIZE,
      p: SCRYPT_PARALLELISM,
    }) as Buffer;
  }

  private encrypt(plaintext: string): Buffer {
    const salt = randomBytes(SALT_LEN);
    const key = this.deriveKey(salt);
    const iv = randomBytes(IV_LEN);

    const cipher = createCipheriv("aes-256-gcm", key, iv);
    const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
    const authTag = cipher.getAuthTag();

    // Layout: salt || iv || authTag || ciphertext
    return Buffer.concat([salt, iv, authTag, encrypted]);
  }

  private decrypt(blob: Buffer): string {
    const salt = blob.subarray(0, SALT_LEN);
    const iv = blob.subarray(SALT_LEN, SALT_LEN + IV_LEN);
    const authTag = blob.subarray(SALT_LEN + IV_LEN, SALT_LEN + IV_LEN + AUTH_TAG_LEN);
    const ciphertext = blob.subarray(SALT_LEN + IV_LEN + AUTH_TAG_LEN);

    const key = this.deriveKey(salt);
    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(authTag);

    const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return decrypted.toString("utf8");
  }

  // -----------------------------------------------------------------------
  // File I/O
  // -----------------------------------------------------------------------

  private async load(): Promise<Map<string, SerialisedNote>> {
    if (this.cache) {
      return this.cache;
    }

    if (!existsSync(this.filePath)) {
      this.cache = new Map();
      return this.cache;
    }

    const blob = readFileSync(this.filePath);
    const json = this.decrypt(blob);
    const records = JSON.parse(json) as Record<string, SerialisedNote>;

    this.cache = new Map(Object.entries(records));
    return this.cache;
  }

  private async flush(data: Map<string, SerialisedNote>): Promise<void> {
    this.cache = data;
    const obj: Record<string, SerialisedNote> = {};
    for (const [key, value] of data) {
      obj[key] = value;
    }
    const json = JSON.stringify(obj, null, 2);
    const encrypted = this.encrypt(json);
    writeFileSync(this.filePath, encrypted);
  }
}
