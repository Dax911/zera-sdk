#!/usr/bin/env node
// ---------------------------------------------------------------------------
// ZERA MCP Server
//
// Exposes shielded pool operations as MCP tools so any AI agent connected via
// the Model Context Protocol can deposit, transfer, withdraw, and check
// balances -- all with the privacy guarantees of Groth16 ZK proofs on Solana.
// ---------------------------------------------------------------------------

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

// SDK imports -- these are the real functions that will be wired up
import {
  createNote,
  computeCommitment,
  computeNullifier,
  hashPubkeyToField,
  generateDepositProof,
  generateWithdrawProof,
  generateTransferProof,
  MerkleTree,
  USDC_DECIMALS,
  SHIELDED_POOL_PROGRAM_ID,
  type Note,
  type StoredNote,
} from "@zera-labs/sdk";

import { loadConfig, type ZeraConfig } from "./config.js";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const config = loadConfig();

// ---------------------------------------------------------------------------
// In-memory note store placeholder
//
// In production this would be an encrypted-at-rest store backed by a local
// file (see config.noteStorePath) with Argon2id + AES-256-GCM encryption.
// For the MVP scaffold we keep notes in memory so the tool implementations
// can demonstrate the data flow.
// ---------------------------------------------------------------------------

interface NoteEntry {
  note: StoredNote;
  spent: boolean;
  memo?: string;
}

const noteStore: NoteEntry[] = [];

function getUnspentNotes(): NoteEntry[] {
  return noteStore.filter((e) => !e.spent);
}

function getShieldedBalance(): number {
  const totalBaseUnits = getUnspentNotes().reduce(
    (sum, e) => sum + e.note.amount,
    0n
  );
  return Number(totalBaseUnits) / 10 ** USDC_DECIMALS;
}

/**
 * Select one or more unspent notes that together cover `amountBaseUnits`.
 * Returns null if insufficient balance.
 */
function selectNotes(amountBaseUnits: bigint): NoteEntry[] | null {
  const sorted = getUnspentNotes().sort((a, b) =>
    a.note.amount > b.note.amount ? -1 : 1
  );
  const selected: NoteEntry[] = [];
  let accumulated = 0n;
  for (const entry of sorted) {
    selected.push(entry);
    accumulated += entry.note.amount;
    if (accumulated >= amountBaseUnits) return selected;
  }
  return null; // insufficient balance
}

// ---------------------------------------------------------------------------
// Server
// ---------------------------------------------------------------------------

const server = new McpServer({
  name: "zera-protocol",
  version: "0.1.0",
});

// ---------------------------------------------------------------------------
// Tool: zera_deposit
// ---------------------------------------------------------------------------

server.tool(
  "zera_deposit",
  "Deposit USDC into the ZERA shielded pool. Funds become private and untraceable after deposit.",
  {
    amount: z.number().positive().describe("Amount of USDC to deposit (e.g., 100.50)"),
    memo: z
      .string()
      .optional()
      .describe("Optional memo for your records (stored privately, never on-chain)"),
  },
  async ({ amount, memo }) => {
    try {
      const amountBaseUnits = BigInt(Math.round(amount * 10 ** USDC_DECIMALS));

      // TODO: Load the USDC asset hash from the SDK constants or derive it
      const USDC_ASSET_ID = 0n; // placeholder

      // 1. Create a new shielded note
      const note = createNote(amountBaseUnits, USDC_ASSET_ID);

      // 2. Compute commitment
      const commitment = computeCommitment(note);

      // 3. Generate the deposit proof
      // TODO: Wire up real circuit paths from config
      // const proofResult = await generateDepositProof(
      //   note,
      //   config.depositWasmPath,
      //   config.depositZkeyPath,
      // );

      // 4. Build and submit the Solana transaction
      // TODO: Use buildDepositTransaction() from SDK + sign with wallet
      // const txSig = await submitTransaction(depositTx);
      const txSig = "TODO_TRANSACTION_SIGNATURE";

      // 5. Get the leaf index from on-chain state after confirmation
      // TODO: Query the on-chain Merkle tree for the new leaf index
      const leafIndex = noteStore.length;

      // 6. Compute the nullifier and store the note
      const nullifier = computeNullifier(note.secret, commitment);
      const storedNote: StoredNote = {
        ...note,
        commitment,
        nullifier,
        leafIndex,
      };
      noteStore.push({ note: storedNote, spent: false, memo });

      const balance = getShieldedBalance();
      return {
        content: [
          {
            type: "text" as const,
            text: `Deposited ${amount.toFixed(2)} USDC into the shielded pool. Tx: ${txSig}. Shielded balance: ${balance.toFixed(2)} USDC.`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Deposit failed: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
        isError: true,
      };
    }
  }
);

// ---------------------------------------------------------------------------
// Tool: zera_transfer
// ---------------------------------------------------------------------------

server.tool(
  "zera_transfer",
  "Send shielded USDC to a recipient. Neither the sender, recipient, nor amount are visible on-chain.",
  {
    amount: z.number().positive().describe("Amount of USDC to send"),
    recipient: z
      .string()
      .describe("Recipient's ZERA shielded address or public key"),
    memo: z
      .string()
      .optional()
      .describe("Optional private memo for the recipient"),
  },
  async ({ amount, recipient, memo }) => {
    try {
      const amountBaseUnits = BigInt(Math.round(amount * 10 ** USDC_DECIMALS));

      // 1. Select input note(s) covering the amount
      const selected = selectNotes(amountBaseUnits);
      if (!selected) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Insufficient shielded balance. You have ${getShieldedBalance().toFixed(2)} USDC but tried to send ${amount.toFixed(2)} USDC.`,
            },
          ],
          isError: true,
        };
      }

      // TODO: For the MVP we assume a single input note (1-in, 2-out transfer)
      const inputEntry = selected[0];
      const inputNote = inputEntry.note;

      // 2. Create output notes: one for recipient, one for change
      const USDC_ASSET_ID = 0n; // placeholder
      const recipientNote = createNote(amountBaseUnits, USDC_ASSET_ID);
      const changeAmount = inputNote.amount - amountBaseUnits;
      const changeNote = createNote(changeAmount, USDC_ASSET_ID);

      // 3. Build the Merkle tree and generate the transfer proof
      // TODO: Fetch on-chain tree state via TreeStateClient
      // const tree = new MerkleTree(TREE_HEIGHT);
      // const proofResult = await generateTransferProof(
      //   inputNote, inputNote.leafIndex, tree,
      //   recipientNote, changeNote,
      //   config.transferWasmPath, config.transferZkeyPath,
      // );

      // 4. Build and submit the Solana transaction
      // TODO: Use buildTransferTransaction() from SDK + sign with wallet
      const txSig = "TODO_TRANSACTION_SIGNATURE";

      // 5. Mark input note as spent and store change note
      inputEntry.spent = true;

      if (changeAmount > 0n) {
        const changeCommitment = computeCommitment(changeNote);
        const changeNullifier = computeNullifier(changeNote.secret, changeCommitment);
        const storedChange: StoredNote = {
          ...changeNote,
          commitment: changeCommitment,
          nullifier: changeNullifier,
          leafIndex: noteStore.length,
        };
        noteStore.push({ note: storedChange, spent: false });
      }

      // TODO: Deliver recipient note data through an encrypted off-chain channel

      const balance = getShieldedBalance();
      return {
        content: [
          {
            type: "text" as const,
            text: `Sent ${amount.toFixed(2)} USDC to ${recipient}. Tx: ${txSig}. Shielded balance: ${balance.toFixed(2)} USDC.`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Transfer failed: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
        isError: true,
      };
    }
  }
);

// ---------------------------------------------------------------------------
// Tool: zera_withdraw
// ---------------------------------------------------------------------------

server.tool(
  "zera_withdraw",
  "Withdraw USDC from the shielded pool to a public Solana wallet address.",
  {
    amount: z.number().positive().describe("Amount of USDC to withdraw"),
    destination: z
      .string()
      .describe("Solana wallet address to receive the USDC"),
  },
  async ({ amount, destination }) => {
    try {
      const amountBaseUnits = BigInt(Math.round(amount * 10 ** USDC_DECIMALS));

      // 1. Select input note(s)
      const selected = selectNotes(amountBaseUnits);
      if (!selected) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Insufficient shielded balance. You have ${getShieldedBalance().toFixed(2)} USDC but tried to withdraw ${amount.toFixed(2)} USDC.`,
            },
          ],
          isError: true,
        };
      }

      const inputEntry = selected[0];
      const inputNote = inputEntry.note;

      // 2. Hash the destination public key into a field element
      // TODO: Use the real hashPubkeyToField once wired up
      // const recipientHash = hashPubkeyToField(destination);

      // 3. Build the Merkle tree and generate the withdrawal proof
      // TODO: Fetch on-chain tree state via TreeStateClient
      // const tree = new MerkleTree(TREE_HEIGHT);
      // const proofResult = await generateWithdrawProof(
      //   inputNote, inputNote.leafIndex, tree,
      //   recipientHash,
      //   config.withdrawWasmPath, config.withdrawZkeyPath,
      // );

      // 4. Build and submit the Solana transaction
      // TODO: Use buildWithdrawTransaction() from SDK + sign with wallet
      const txSig = "TODO_TRANSACTION_SIGNATURE";

      // 5. Mark the input note as spent
      inputEntry.spent = true;

      // 6. Handle change if input > withdrawal amount
      const changeAmount = inputNote.amount - amountBaseUnits;
      if (changeAmount > 0n) {
        const USDC_ASSET_ID = 0n; // placeholder
        const changeNote = createNote(changeAmount, USDC_ASSET_ID);
        const changeCommitment = computeCommitment(changeNote);
        const changeNullifier = computeNullifier(changeNote.secret, changeCommitment);
        const storedChange: StoredNote = {
          ...changeNote,
          commitment: changeCommitment,
          nullifier: changeNullifier,
          leafIndex: noteStore.length,
        };
        noteStore.push({ note: storedChange, spent: false });
      }

      const balance = getShieldedBalance();
      return {
        content: [
          {
            type: "text" as const,
            text: `Withdrew ${amount.toFixed(2)} USDC to ${destination}. Tx: ${txSig}. Shielded balance: ${balance.toFixed(2)} USDC.`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Withdrawal failed: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
        isError: true,
      };
    }
  }
);

// ---------------------------------------------------------------------------
// Tool: zera_balance
// ---------------------------------------------------------------------------

server.tool(
  "zera_balance",
  "Check your shielded USDC balance. This is a local operation -- nothing is revealed on-chain.",
  {},
  async () => {
    const balance = getShieldedBalance();
    const unspentCount = getUnspentNotes().length;

    return {
      content: [
        {
          type: "text" as const,
          text: `Shielded balance: ${balance.toFixed(2)} USDC (${unspentCount} unspent note${unspentCount !== 1 ? "s" : ""}).`,
        },
      ],
    };
  }
);

// ---------------------------------------------------------------------------
// Start server
// ---------------------------------------------------------------------------

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error("ZERA MCP server failed to start:", error);
  process.exit(1);
});
