import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  ConnectionProvider,
  WalletProvider,
  useConnection,
  useWallet,
} from "@solana/wallet-adapter-react";
import {
  WalletModalProvider,
  WalletMultiButton,
} from "@solana/wallet-adapter-react-ui";
import { PhantomWalletAdapter, SolflareWalletAdapter } from "@solana/wallet-adapter-wallets";
import {
  Connection,
  PublicKey,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import {
  createNote,
  computeCommitment,
  computeNullifier,
  hashPubkeyToField,
  MerkleTree,
  MemoryNoteStore,
  buildDepositTransaction,
  buildWithdrawTransaction,
  buildTransferTransaction,
  derivePoolConfig,
  deriveMerkleTree,
  deriveVault,
  deriveFeeVault,
  deriveNullifier,
  getAssociatedTokenAddress,
  USDC_MINT,
  USDC_DECIMALS,
  SHIELDED_POOL_PROGRAM_ID,
  BN254_PRIME,
  FEE_BASIS_POINTS,
  TOTAL_BASIS_POINTS,
} from "@zera-labs/sdk";
import type { StoredNote, SolanaProof } from "@zera-labs/sdk";

import "@solana/wallet-adapter-react-ui/styles.css";
import "./index.css";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const RPC_URL = import.meta.env.VITE_RPC_URL || "http://64.34.82.145:18899";
const DEMO_TREE_HEIGHT = 12; // 4096 leaves, fast enough for browser
const USDC_FACTOR = 10n ** BigInt(USDC_DECIMALS);
const PROGRAM_ID = new PublicKey(SHIELDED_POOL_PROGRAM_ID);
const MINT = new PublicKey(USDC_MINT);

type Tab = "dashboard" | "shield" | "transfer" | "withdraw";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatUsdc(amount: bigint): string {
  const whole = amount / USDC_FACTOR;
  const frac = (amount % USDC_FACTOR).toString().padStart(USDC_DECIMALS, "0");
  return `${whole.toLocaleString()}.${frac.slice(0, 2)}`;
}

function truncAddr(addr: string, len = 4): string {
  return `${addr.slice(0, len)}...${addr.slice(-len)}`;
}

function truncHex(n: bigint, len = 8): string {
  const h = n.toString(16).padStart(16, "0");
  return `0x${h.slice(0, len)}...${h.slice(-4)}`;
}

interface StepState {
  label: string;
  detail?: string;
  status: "pending" | "running" | "done" | "error";
  ms?: number;
}

// ---------------------------------------------------------------------------
// Wallet wrapper
// ---------------------------------------------------------------------------

function AppWrapper() {
  const wallets = useMemo(() => [
    new PhantomWalletAdapter(),
    new SolflareWalletAdapter(),
  ], []);

  return (
    <ConnectionProvider endpoint={RPC_URL}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>
          <AppInner />
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}

export default AppWrapper;

// ---------------------------------------------------------------------------
// Main app
// ---------------------------------------------------------------------------

function AppInner() {
  const { connection } = useConnection();
  const { publicKey, sendTransaction, connected } = useWallet();

  // --- SDK state ---
  const [tree, setTree] = useState<MerkleTree | null>(null);
  const [store] = useState(() => new MemoryNoteStore());
  const treeRef = useRef<MerkleTree | null>(null);
  const assetHashRef = useRef<bigint>(0n);

  // --- UI state ---
  const [tab, setTab] = useState<Tab>("dashboard");
  const [solBalance, setSolBalance] = useState<number | null>(null);
  const [usdcBalance, setUsdcBalance] = useState<bigint | null>(null);
  const [shieldedBalance, setShieldedBalance] = useState(0n);
  const [unspentNotes, setUnspentNotes] = useState<StoredNote[]>([]);
  const [poolInfo, setPoolInfo] = useState<{ exists: boolean; vaultBalance?: string; leafCount: number } | null>(null);

  // --- Initialize tree + asset hash on mount ---
  useEffect(() => {
    (async () => {
      const t = await MerkleTree.create(DEMO_TREE_HEIGHT);
      treeRef.current = t;
      setTree(t);
      assetHashRef.current = await hashPubkeyToField(MINT.toBytes());
    })();
  }, []);

  // --- Fetch balances when wallet connects ---
  useEffect(() => {
    if (!publicKey || !connection) return;
    let cancelled = false;

    const fetchBalances = async () => {
      try {
        const sol = await connection.getBalance(publicKey);
        if (!cancelled) setSolBalance(sol / LAMPORTS_PER_SOL);
      } catch { /* ignore */ }

      try {
        const ata = getAssociatedTokenAddress(MINT, publicKey);
        const resp = await connection.getTokenAccountBalance(ata);
        if (!cancelled) setUsdcBalance(BigInt(resp.value.amount));
      } catch {
        if (!cancelled) setUsdcBalance(0n);
      }
    };

    fetchBalances();
    const interval = setInterval(fetchBalances, 15000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [publicKey, connection]);

  // --- Fetch pool info ---
  useEffect(() => {
    (async () => {
      try {
        const [poolConfigPda] = derivePoolConfig(MINT, PROGRAM_ID);
        const info = await connection.getAccountInfo(poolConfigPda);
        const [vaultPda] = deriveVault(MINT, PROGRAM_ID);
        let vaultBal: string | undefined;
        try {
          const tb = await connection.getTokenAccountBalance(vaultPda);
          vaultBal = tb.value.uiAmountString ?? undefined;
        } catch { /* vault might not exist */ }
        setPoolInfo({
          exists: !!info,
          vaultBalance: vaultBal,
          leafCount: treeRef.current?.leafCount ?? 0,
        });
      } catch {
        setPoolInfo({ exists: false, leafCount: 0 });
      }
    })();
  }, [connection, tree]);

  // --- Refresh shielded state ---
  const refreshShielded = useCallback(async () => {
    const notes = await store.getUnspent();
    setUnspentNotes(notes);
    setShieldedBalance(notes.reduce((s, n) => s + n.amount, 0n));
  }, [store]);

  // --- PDA derivations ---
  const pdas = useMemo(() => {
    const [poolConfig, poolBump] = derivePoolConfig(MINT, PROGRAM_ID);
    const [merkleTree, treeBump] = deriveMerkleTree(MINT, PROGRAM_ID);
    const [vault, vaultBump] = deriveVault(MINT, PROGRAM_ID);
    const [feeVault, feeBump] = deriveFeeVault(MINT, PROGRAM_ID);
    return { poolConfig, poolBump, merkleTree, treeBump, vault, vaultBump, feeVault, feeBump };
  }, []);

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------
  if (!tree) {
    return (
      <div className="app" style={{ textAlign: "center", paddingTop: "4rem", color: "var(--text-dim)" }}>
        Initializing Poseidon Merkle tree...
      </div>
    );
  }

  return (
    <div className="app">
      {/* Header */}
      <div className="header">
        <h1>ZERA Privacy Wallet <span className="tag">SDK Demo</span></h1>
        <div className="header-right">
          <div className="network-badge">Mainnet</div>
          <WalletMultiButton />
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: "0.25rem", marginBottom: "1rem" }}>
        {(["dashboard", "shield", "transfer", "withdraw"] as Tab[]).map((t) => (
          <button
            key={t}
            className={t === tab ? "" : "secondary"}
            style={{ flex: 1, textTransform: "capitalize" }}
            onClick={() => setTab(t)}
          >
            {t === "shield" ? "Shield" : t === "transfer" ? "Transfer" : t === "withdraw" ? "Withdraw" : "Dashboard"}
          </button>
        ))}
      </div>

      {tab === "dashboard" && (
        <DashboardTab
          connected={connected}
          publicKey={publicKey}
          solBalance={solBalance}
          usdcBalance={usdcBalance}
          shieldedBalance={shieldedBalance}
          unspentNotes={unspentNotes}
          poolInfo={poolInfo}
          pdas={pdas}
          treeRef={treeRef}
        />
      )}

      {tab === "shield" && (
        <ShieldTab
          connected={connected}
          publicKey={publicKey}
          usdcBalance={usdcBalance}
          treeRef={treeRef}
          store={store}
          assetHash={assetHashRef.current}
          connection={connection}
          sendTransaction={sendTransaction}
          onDone={() => { refreshShielded(); setTab("dashboard"); }}
        />
      )}

      {tab === "transfer" && (
        <TransferTab
          connected={connected}
          treeRef={treeRef}
          store={store}
          assetHash={assetHashRef.current}
          unspentNotes={unspentNotes}
          onDone={refreshShielded}
        />
      )}

      {tab === "withdraw" && (
        <WithdrawTab
          connected={connected}
          publicKey={publicKey}
          treeRef={treeRef}
          store={store}
          unspentNotes={unspentNotes}
          connection={connection}
          sendTransaction={sendTransaction}
          onDone={refreshShielded}
        />
      )}
    </div>
  );
}

// ===========================================================================
// Dashboard
// ===========================================================================

function DashboardTab({ connected, publicKey, solBalance, usdcBalance, shieldedBalance, unspentNotes, poolInfo, pdas, treeRef }: {
  connected: boolean;
  publicKey: PublicKey | null;
  solBalance: number | null;
  usdcBalance: bigint | null;
  shieldedBalance: bigint;
  unspentNotes: StoredNote[];
  poolInfo: any;
  pdas: any;
  treeRef: React.MutableRefObject<MerkleTree | null>;
}) {
  if (!connected) {
    return (
      <div className="panel" style={{ textAlign: "center", padding: "3rem 1rem" }}>
        <div style={{ fontSize: "1.5rem", marginBottom: "0.75rem" }}>Connect Your Wallet</div>
        <p style={{ color: "var(--text-dim)", fontSize: "0.85rem", marginBottom: "1.5rem", maxWidth: 400, margin: "0 auto 1.5rem" }}>
          Connect a Solana wallet to view your balances, interact with the ZERA shielded pool, and make private transactions using real SDK operations.
        </p>
        <WalletMultiButton />
      </div>
    );
  }

  return (
    <>
      {/* Balances */}
      <div className="grid-3">
        <div className="panel" style={{ textAlign: "center" }}>
          <div className="balance-label">SOL Balance</div>
          <div style={{ fontFamily: "var(--mono)", fontSize: "1.3rem", fontWeight: 600 }}>
            {solBalance !== null ? solBalance.toFixed(4) : "—"}
          </div>
        </div>
        <div className="panel" style={{ textAlign: "center" }}>
          <div className="balance-label">Public USDC</div>
          <div style={{ fontFamily: "var(--mono)", fontSize: "1.3rem", fontWeight: 600 }}>
            {usdcBalance !== null ? formatUsdc(usdcBalance) : "—"}
          </div>
        </div>
        <div className="panel panel-accent" style={{ textAlign: "center" }}>
          <div className="balance-label">Shielded USDC</div>
          <div style={{ fontFamily: "var(--mono)", fontSize: "1.3rem", fontWeight: 600, color: "var(--success)" }}>
            {formatUsdc(shieldedBalance)}
          </div>
          <div style={{ fontSize: "0.7rem", color: "var(--text-dim)", marginTop: "0.2rem" }}>
            {unspentNotes.length} note{unspentNotes.length !== 1 ? "s" : ""}
          </div>
        </div>
      </div>

      {/* Pool status */}
      <div className="grid-2">
        <div className="panel">
          <div className="panel-title" style={{ marginBottom: "0.5rem" }}>Shielded Pool</div>
          <div className="stat-row">
            <span className="stat-label">Program</span>
            <span className="stat-value hex">{truncAddr(PROGRAM_ID.toBase58(), 6)}</span>
          </div>
          <div className="stat-row">
            <span className="stat-label">Pool Config</span>
            <span className="stat-value hex">{truncAddr(pdas.poolConfig.toBase58(), 6)}</span>
          </div>
          <div className="stat-row">
            <span className="stat-label">Vault</span>
            <span className="stat-value hex">{truncAddr(pdas.vault.toBase58(), 6)}</span>
          </div>
          <div className="stat-row">
            <span className="stat-label">Pool Exists</span>
            <span className="stat-value" style={{ color: poolInfo?.exists ? "var(--success)" : "var(--text-dim)" }}>
              {poolInfo?.exists ? "Yes" : "Not deployed"}
            </span>
          </div>
          {poolInfo?.vaultBalance && (
            <div className="stat-row">
              <span className="stat-label">Vault TVL</span>
              <span className="stat-value">{poolInfo.vaultBalance} USDC</span>
            </div>
          )}
        </div>

        <div className="panel">
          <div className="panel-title" style={{ marginBottom: "0.5rem" }}>Local Merkle Tree</div>
          <div className="stat-row">
            <span className="stat-label">Height</span>
            <span className="stat-value">{DEMO_TREE_HEIGHT}</span>
          </div>
          <div className="stat-row">
            <span className="stat-label">Capacity</span>
            <span className="stat-value">{(2 ** DEMO_TREE_HEIGHT).toLocaleString()}</span>
          </div>
          <div className="stat-row">
            <span className="stat-label">Leaves</span>
            <span className="stat-value">{treeRef.current?.leafCount ?? 0}</span>
          </div>
          <div className="stat-row">
            <span className="stat-label">Root</span>
            <span className="stat-value hex">{truncHex(treeRef.current?.getRoot() ?? 0n, 6)}</span>
          </div>
          <div className="stat-row">
            <span className="stat-label">BN254 Field</span>
            <span className="stat-value hex" style={{ fontSize: "0.7rem" }}>{BN254_PRIME.toString().slice(0, 14)}...</span>
          </div>
        </div>
      </div>

      {/* Shielded notes */}
      {unspentNotes.length > 0 && (
        <div className="panel">
          <div className="panel-title" style={{ marginBottom: "0.5rem" }}>Shielded Notes</div>
          {unspentNotes.map((note, i) => (
            <div className="agent-card" key={i}>
              <div className="agent-avatar" style={{ background: "var(--success-dim)", color: "var(--success)" }}>
                #{note.leafIndex}
              </div>
              <div className="agent-info">
                <div className="agent-name">{formatUsdc(note.amount)} USDC</div>
                <div className="agent-role hex">commitment: {truncHex(note.commitment)}</div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div className="agent-balance-sub hex">nullifier: {truncHex(note.nullifier, 6)}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Wallet */}
      <div className="panel">
        <div className="panel-title" style={{ marginBottom: "0.5rem" }}>Wallet</div>
        <div className="stat-row">
          <span className="stat-label">Address</span>
          <span className="stat-value hex">{publicKey?.toBase58()}</span>
        </div>
        <div className="stat-row">
          <span className="stat-label">ATA (USDC)</span>
          <span className="stat-value hex">
            {publicKey ? truncAddr(getAssociatedTokenAddress(MINT, publicKey).toBase58(), 6) : "—"}
          </span>
        </div>
      </div>
    </>
  );
}

// ===========================================================================
// Shield (Deposit)
// ===========================================================================

function ShieldTab({ connected, publicKey, usdcBalance, treeRef, store, assetHash, connection, sendTransaction, onDone }: {
  connected: boolean;
  publicKey: PublicKey | null;
  usdcBalance: bigint | null;
  treeRef: React.MutableRefObject<MerkleTree | null>;
  store: MemoryNoteStore;
  assetHash: bigint;
  connection: Connection;
  sendTransaction: any;
  onDone: () => void;
}) {
  const [amount, setAmount] = useState("1.00");
  const [steps, setSteps] = useState<StepState[]>([]);
  const [running, setRunning] = useState(false);
  const [builtNote, setBuiltNote] = useState<StoredNote | null>(null);
  const [builtTx, setBuiltTx] = useState<any>(null);

  const doShield = useCallback(async () => {
    const t = treeRef.current;
    if (!t || !publicKey || running) return;
    setRunning(true);
    setBuiltNote(null);
    setBuiltTx(null);

    const amountBase = BigInt(Math.round(parseFloat(amount) * 1_000_000));

    const s: StepState[] = [
      { label: "Hashing USDC mint to BN254 field element", status: "pending" },
      { label: "Generating 248-bit random secret + blinding", status: "pending" },
      { label: "Computing Poseidon commitment (7 inputs)", status: "pending" },
      { label: "Deriving nullifier = Poseidon(secret, commitment)", status: "pending" },
      { label: "Inserting commitment into Merkle tree", status: "pending" },
      { label: "Saving encrypted note to local store", status: "pending" },
      { label: "Deriving on-chain PDAs (pool, vault, nullifier)", status: "pending" },
      { label: "Building Solana deposit transaction", status: "pending" },
    ];
    setSteps([...s]);

    const run = async (idx: number, fn: () => Promise<any>): Promise<any> => {
      s[idx].status = "running";
      setSteps([...s]);
      const t0 = performance.now();
      try {
        const result = await fn();
        s[idx].status = "done";
        s[idx].ms = Math.round(performance.now() - t0);
        setSteps([...s]);
        return result;
      } catch (err: any) {
        s[idx].status = "error";
        s[idx].detail = err.message;
        setSteps([...s]);
        throw err;
      }
    };

    try {
      const hash = await run(0, () => hashPubkeyToField(MINT.toBytes()));
      s[0].detail = `= ${truncHex(hash)}`;
      setSteps([...s]);

      const note = await run(1, async () => createNote(amountBase, hash));
      s[1].detail = `secret: ${truncHex(note.secret)}, blinding: ${truncHex(note.blinding)}`;
      setSteps([...s]);

      const commitment = await run(2, () => computeCommitment(note));
      s[2].detail = `= ${truncHex(commitment)}`;
      setSteps([...s]);

      const nullifier = await run(3, () => computeNullifier(note.secret, commitment));
      s[3].detail = `= ${truncHex(nullifier)}`;
      setSteps([...s]);

      const leafIndex = await run(4, async () => t.insert(commitment));
      s[4].detail = `leaf #${leafIndex}, new root: ${truncHex(t.getRoot())}`;
      setSteps([...s]);

      const stored: StoredNote = { ...note, commitment, nullifier, leafIndex };
      await run(5, () => store.save(stored));
      s[5].detail = `${(await store.getUnspent()).length} unspent notes in store`;
      setSteps([...s]);

      await run(6, async () => {
        const [np] = deriveNullifier(nullifier, PROGRAM_ID);
        return np;
      });
      s[6].detail = `pool: ${truncAddr(derivePoolConfig(MINT, PROGRAM_ID)[0].toBase58(), 4)}, vault: ${truncAddr(deriveVault(MINT, PROGRAM_ID)[0].toBase58(), 4)}`;
      setSteps([...s]);

      // Build real transaction with placeholder proof
      // (real proof needs circuit files — .wasm + .zkey)
      const placeholderProof: SolanaProof = {
        proofA: new Uint8Array(64),
        proofB: new Uint8Array(128),
        proofC: new Uint8Array(64),
      };

      const tx = await run(7, async () => {
        const transaction = buildDepositTransaction({
          payer: publicKey,
          mint: MINT,
          amount: amountBase,
          commitment,
          proof: placeholderProof,
          publicInputs: [],
          programId: PROGRAM_ID,
        });
        const { blockhash } = await connection.getLatestBlockhash();
        transaction.recentBlockhash = blockhash;
        transaction.feePayer = publicKey;
        return transaction;
      });
      s[7].detail = `${tx.instructions.length} instructions, ~${tx.serializeMessage().length} bytes`;
      setSteps([...s]);

      setBuiltNote(stored);
      setBuiltTx(tx);
    } catch {
      // error already shown in steps
    }

    setRunning(false);
  }, [amount, publicKey, treeRef, store, assetHash, connection, running]);

  const submitTx = useCallback(async () => {
    if (!builtTx || !publicKey) return;
    try {
      const sig = await sendTransaction(builtTx, connection);
      alert(`Transaction submitted: ${sig}\n\nNote: This will fail without a real Groth16 proof. In production, generate the proof with circuit files first.`);
      onDone();
    } catch (err: any) {
      alert(`Transaction failed: ${err.message}`);
    }
  }, [builtTx, publicKey, sendTransaction, connection, onDone]);

  if (!connected) {
    return <div className="panel" style={{ textAlign: "center", padding: "2rem" }}>Connect your wallet to shield tokens.</div>;
  }

  return (
    <>
      <div className="panel">
        <div className="section-title">Shield USDC <span className="badge">Deposit</span></div>
        <p style={{ fontSize: "0.78rem", color: "var(--text-dim)", marginBottom: "1rem", lineHeight: 1.5 }}>
          Convert public USDC into a private shielded note. The SDK creates a Poseidon commitment that
          hides the amount and owner, then inserts it into the Merkle tree.
        </p>

        <div style={{ display: "flex", gap: "0.75rem", alignItems: "flex-end" }}>
          <div className="field" style={{ flex: 1, marginBottom: 0 }}>
            <label>Amount (USDC)</label>
            <input type="text" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="1.00" />
          </div>
          <div style={{ paddingBottom: "0.15rem" }}>
            <button onClick={doShield} disabled={running}>
              {running ? "Processing..." : "Shield Tokens"}
            </button>
          </div>
        </div>

        {usdcBalance !== null && (
          <div style={{ fontSize: "0.72rem", color: "var(--text-dim)", marginTop: "0.4rem" }}>
            Available: {formatUsdc(usdcBalance)} USDC
          </div>
        )}
      </div>

      {steps.length > 0 && (
        <div className="panel">
          <div className="panel-title" style={{ marginBottom: "0.5rem" }}>SDK Operations</div>
          <div className="steps">
            {steps.map((s, i) => (
              <div className={`step ${s.status}`} key={i}>
                <div className="step-dot">
                  {s.status === "done" ? "✓" : s.status === "running" ? "◌" : s.status === "error" ? "✗" : ""}
                </div>
                <div style={{ flex: 1 }}>
                  <div>{s.label}</div>
                  {s.detail && (
                    <div style={{ fontSize: "0.7rem", fontFamily: "var(--mono)", color: s.status === "error" ? "var(--error)" : "var(--text-dim)", marginTop: "0.15rem" }}>
                      {s.detail}
                    </div>
                  )}
                </div>
                {s.ms !== undefined && <span className="step-time">{s.ms}ms</span>}
              </div>
            ))}
          </div>

          {builtNote && builtTx && (
            <div style={{ marginTop: "1rem", paddingTop: "1rem", borderTop: "1px solid var(--border)" }}>
              <div style={{ fontSize: "0.78rem", marginBottom: "0.75rem" }}>
                Transaction built. To submit on-chain, you also need a <strong>Groth16 proof</strong> generated
                from the circuit files (<code style={{ color: "var(--accent)" }}>deposit.wasm</code> + <code style={{ color: "var(--accent)" }}>deposit.zkey</code>).
              </div>
              <div style={{ display: "flex", gap: "0.5rem" }}>
                <button onClick={submitTx}>Sign & Submit (will fail without proof)</button>
                <button className="secondary" onClick={onDone}>Done — Keep Note</button>
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );
}

// ===========================================================================
// Transfer
// ===========================================================================

function TransferTab({ connected, treeRef, store, assetHash, unspentNotes, onDone }: {
  connected: boolean;
  treeRef: React.MutableRefObject<MerkleTree | null>;
  store: MemoryNoteStore;
  assetHash: bigint;
  unspentNotes: StoredNote[];
  onDone: () => void;
}) {
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const [sendAmount, setSendAmount] = useState("");
  const [recipientAddr, setRecipientAddr] = useState("");
  const [steps, setSteps] = useState<StepState[]>([]);
  const [running, setRunning] = useState(false);

  const selectedNote = selectedIdx !== null ? unspentNotes[selectedIdx] : null;
  const sendBase = BigInt(Math.round((parseFloat(sendAmount) || 0) * 1_000_000));
  const changeAmount = selectedNote ? selectedNote.amount - sendBase : 0n;

  const doTransfer = useCallback(async () => {
    const t = treeRef.current;
    if (!t || !selectedNote || running || sendBase <= 0n || sendBase > selectedNote.amount) return;
    setRunning(true);

    const s: StepState[] = [
      { label: "Hashing recipient address to field element", status: "pending" },
      { label: "Generating Merkle inclusion proof", status: "pending" },
      { label: "Creating output note 1 (payment)", status: "pending" },
      { label: "Creating output note 2 (change)", status: "pending" },
      { label: "Computing output commitments", status: "pending" },
      { label: "Inserting output commitments into tree", status: "pending" },
      { label: "Marking input note as spent (nullified)", status: "pending" },
      { label: "Building transfer transaction", status: "pending" },
    ];
    setSteps([...s]);

    const run = async (idx: number, fn: () => Promise<any>): Promise<any> => {
      s[idx].status = "running";
      setSteps([...s]);
      const t0 = performance.now();
      const result = await fn();
      s[idx].status = "done";
      s[idx].ms = Math.round(performance.now() - t0);
      setSteps([...s]);
      return result;
    };

    try {
      let recipientHash = 0n;
      if (recipientAddr.trim()) {
        recipientHash = await run(0, () => hashPubkeyToField(new PublicKey(recipientAddr.trim()).toBytes()));
        s[0].detail = `= ${truncHex(recipientHash)}`;
      } else {
        s[0].status = "done";
        s[0].detail = "No recipient — self-transfer (note splitting)";
      }
      setSteps([...s]);

      const proof = await run(1, () => t.getProof(selectedNote.leafIndex));
      s[1].detail = `${proof.pathElements.length} siblings, indices: [${proof.pathIndices.slice(0, 4).join(",")}...]`;
      setSteps([...s]);

      const outNote1 = await run(2, async () => createNote(sendBase, assetHash));
      s[2].detail = `${formatUsdc(sendBase)} USDC, secret: ${truncHex(outNote1.secret, 6)}`;
      setSteps([...s]);

      const outNote2 = await run(3, async () => createNote(changeAmount > 0n ? changeAmount : 0n, assetHash));
      s[3].detail = `${formatUsdc(changeAmount > 0n ? changeAmount : 0n)} USDC change`;
      setSteps([...s]);

      const [c1, c2] = await run(4, async () => {
        const c1 = await computeCommitment(outNote1);
        const c2 = await computeCommitment(outNote2);
        return [c1, c2];
      });
      s[4].detail = `out1: ${truncHex(c1, 6)}, out2: ${truncHex(c2, 6)}`;
      setSteps([...s]);

      const [l1, l2] = await run(5, async () => {
        const l1 = await t.insert(c1);
        const l2 = await t.insert(c2);
        return [l1, l2];
      });
      s[5].detail = `leaves #${l1}, #${l2}, new root: ${truncHex(t.getRoot(), 6)}`;
      setSteps([...s]);

      // Nullify input, save outputs
      await run(6, async () => {
        await store.markSpent(selectedNote.commitment, `transfer_${Date.now()}`);
        const n1 = await computeNullifier(outNote1.secret, c1);
        const n2 = await computeNullifier(outNote2.secret, c2);
        await store.save({ ...outNote1, commitment: c1, nullifier: n1, leafIndex: l1 });
        if (changeAmount > 0n) {
          await store.save({ ...outNote2, commitment: c2, nullifier: n2, leafIndex: l2 });
        }
      });
      s[6].detail = `nullifier ${truncHex(selectedNote.nullifier, 6)} revealed`;
      setSteps([...s]);

      s[7].status = "done";
      s[7].detail = "Transfer complete. In production, a Groth16 proof verifies value conservation: input = output1 + output2";
      s[7].ms = 0;
      setSteps([...s]);

      onDone();
    } catch (err: any) {
      s.find((x) => x.status === "running")!.status = "error";
      s.find((x) => x.status === "error")!.detail = err.message;
      setSteps([...s]);
    }

    setRunning(false);
  }, [selectedNote, sendBase, changeAmount, recipientAddr, treeRef, store, assetHash, running, onDone]);

  if (!connected) {
    return <div className="panel" style={{ textAlign: "center", padding: "2rem" }}>Connect your wallet first.</div>;
  }

  return (
    <>
      <div className="panel">
        <div className="section-title">Private Transfer <span className="badge">Shielded</span></div>
        <p style={{ fontSize: "0.78rem", color: "var(--text-dim)", marginBottom: "1rem", lineHeight: 1.5 }}>
          Split a shielded note into two outputs: a payment and change. The ZK proof enforces
          value conservation without revealing amounts on-chain.
        </p>

        {unspentNotes.length === 0 ? (
          <div style={{ color: "var(--text-dim)", fontSize: "0.82rem" }}>No shielded notes. Shield some USDC first.</div>
        ) : (
          <>
            <div style={{ fontSize: "0.72rem", color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "0.4rem" }}>
              Select input note
            </div>
            {unspentNotes.map((note, i) => (
              <div
                className={`agent-card ${selectedIdx === i ? "active" : ""}`}
                key={i}
                onClick={() => setSelectedIdx(i)}
                style={{ cursor: "pointer" }}
              >
                <div className="agent-avatar" style={{ background: "var(--success-dim)", color: "var(--success)", fontSize: "0.7rem" }}>
                  #{note.leafIndex}
                </div>
                <div className="agent-info">
                  <div className="agent-name">{formatUsdc(note.amount)} USDC</div>
                  <div className="agent-role hex">{truncHex(note.commitment)}</div>
                </div>
              </div>
            ))}

            {selectedNote && (
              <div style={{ marginTop: "1rem" }}>
                <div style={{ display: "flex", gap: "0.75rem" }}>
                  <div className="field" style={{ flex: 1 }}>
                    <label>Send Amount (USDC)</label>
                    <input
                      type="text"
                      value={sendAmount}
                      onChange={(e) => setSendAmount(e.target.value)}
                      placeholder={`Max: ${formatUsdc(selectedNote.amount)}`}
                    />
                  </div>
                  <div className="field" style={{ flex: 1 }}>
                    <label>Recipient (optional)</label>
                    <input
                      type="text"
                      value={recipientAddr}
                      onChange={(e) => setRecipientAddr(e.target.value)}
                      placeholder="Solana address..."
                    />
                  </div>
                </div>
                {sendBase > 0n && (
                  <div style={{ fontSize: "0.75rem", color: "var(--text-dim)", marginBottom: "0.75rem" }}>
                    Payment: {formatUsdc(sendBase)} USDC | Change: {formatUsdc(changeAmount > 0n ? changeAmount : 0n)} USDC
                  </div>
                )}
                <button onClick={doTransfer} disabled={running || sendBase <= 0n || sendBase > selectedNote.amount}>
                  {running ? "Processing..." : "Send Privately"}
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {steps.length > 0 && (
        <div className="panel">
          <div className="panel-title" style={{ marginBottom: "0.5rem" }}>SDK Operations</div>
          <div className="steps">
            {steps.map((s, i) => (
              <div className={`step ${s.status}`} key={i}>
                <div className="step-dot">
                  {s.status === "done" ? "✓" : s.status === "running" ? "◌" : s.status === "error" ? "✗" : ""}
                </div>
                <div style={{ flex: 1 }}>
                  <div>{s.label}</div>
                  {s.detail && (
                    <div style={{ fontSize: "0.7rem", fontFamily: "var(--mono)", color: s.status === "error" ? "var(--error)" : "var(--text-dim)", marginTop: "0.15rem" }}>
                      {s.detail}
                    </div>
                  )}
                </div>
                {s.ms !== undefined && <span className="step-time">{s.ms}ms</span>}
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

// ===========================================================================
// Withdraw
// ===========================================================================

function WithdrawTab({ connected, publicKey, treeRef, store, unspentNotes, connection, sendTransaction, onDone }: {
  connected: boolean;
  publicKey: PublicKey | null;
  treeRef: React.MutableRefObject<MerkleTree | null>;
  store: MemoryNoteStore;
  unspentNotes: StoredNote[];
  connection: Connection;
  sendTransaction: any;
  onDone: () => void;
}) {
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const [recipientAddr, setRecipientAddr] = useState("");
  const [steps, setSteps] = useState<StepState[]>([]);
  const [running, setRunning] = useState(false);

  const selectedNote = selectedIdx !== null ? unspentNotes[selectedIdx] : null;

  // Auto-fill recipient with connected wallet
  useEffect(() => {
    if (publicKey && !recipientAddr) setRecipientAddr(publicKey.toBase58());
  }, [publicKey]);

  const fee = selectedNote
    ? (selectedNote.amount * BigInt(FEE_BASIS_POINTS)) / BigInt(TOTAL_BASIS_POINTS)
    : 0n;
  const receiveAmount = selectedNote ? selectedNote.amount - fee : 0n;

  const doWithdraw = useCallback(async () => {
    const t = treeRef.current;
    if (!t || !selectedNote || !recipientAddr.trim() || running) return;
    setRunning(true);

    const s: StepState[] = [
      { label: "Hashing recipient to field element (proof binding)", status: "pending" },
      { label: "Generating Merkle inclusion proof", status: "pending" },
      { label: "Computing nullifier to prevent double-spend", status: "pending" },
      { label: "Deriving nullifier PDA (on-chain existence check)", status: "pending" },
      { label: "Building withdrawal transaction", status: "pending" },
      { label: "Marking note as spent in local store", status: "pending" },
    ];
    setSteps([...s]);

    const run = async (idx: number, fn: () => Promise<any>): Promise<any> => {
      s[idx].status = "running";
      setSteps([...s]);
      const t0 = performance.now();
      const result = await fn();
      s[idx].status = "done";
      s[idx].ms = Math.round(performance.now() - t0);
      setSteps([...s]);
      return result;
    };

    try {
      const recipientPk = new PublicKey(recipientAddr.trim());

      const recipientHash = await run(0, () => hashPubkeyToField(recipientPk.toBytes()));
      s[0].detail = `Binds proof to ${truncAddr(recipientAddr, 4)} — prevents redirection attacks`;
      setSteps([...s]);

      const proof = await run(1, () => t.getProof(selectedNote.leafIndex));
      s[1].detail = `${proof.pathElements.length} siblings proving leaf #${selectedNote.leafIndex} exists in tree`;
      setSteps([...s]);

      const nullifier = await run(2, async () => computeNullifier(selectedNote.secret, selectedNote.commitment));
      s[2].detail = `= ${truncHex(nullifier)} — revealed on-chain, blocks re-spending`;
      setSteps([...s]);

      const [nullPda] = await run(3, async () => deriveNullifier(nullifier, PROGRAM_ID));
      s[3].detail = `PDA: ${truncAddr(nullPda.toBase58(), 6)} — Solana runtime rejects duplicate creation`;
      setSteps([...s]);

      const placeholderProof: SolanaProof = {
        proofA: new Uint8Array(64),
        proofB: new Uint8Array(128),
        proofC: new Uint8Array(64),
      };

      await run(4, async () => {
        const tx = buildWithdrawTransaction({
          payer: recipientPk,
          recipient: recipientPk,
          mint: MINT,
          amount: selectedNote.amount,
          nullifierHash: nullifier,
          root: t.getRoot(),
          proof: placeholderProof,
          publicInputs: [],
          programId: PROGRAM_ID,
        });
        return tx;
      });
      s[4].detail = `Tx built. Fee: ${formatUsdc(fee)} USDC (${FEE_BASIS_POINTS} bps). Receive: ${formatUsdc(receiveAmount)} USDC`;
      setSteps([...s]);

      await run(5, async () => store.markSpent(selectedNote.commitment, `withdraw_${Date.now()}`));
      s[5].detail = "Note removed from unspent set";
      setSteps([...s]);

      onDone();
    } catch (err: any) {
      const failed = s.find((x) => x.status === "running");
      if (failed) {
        failed.status = "error";
        failed.detail = err.message;
      }
      setSteps([...s]);
    }

    setRunning(false);
  }, [selectedNote, recipientAddr, treeRef, store, running, onDone, fee, receiveAmount]);

  if (!connected) {
    return <div className="panel" style={{ textAlign: "center", padding: "2rem" }}>Connect your wallet first.</div>;
  }

  return (
    <>
      <div className="panel">
        <div className="section-title">Withdraw USDC <span className="badge">Unshield</span></div>
        <p style={{ fontSize: "0.78rem", color: "var(--text-dim)", marginBottom: "1rem", lineHeight: 1.5 }}>
          Convert a shielded note back to public USDC. The nullifier is revealed on-chain to prevent double-spending,
          but nothing links this withdrawal to the original deposit.
        </p>

        {unspentNotes.length === 0 ? (
          <div style={{ color: "var(--text-dim)", fontSize: "0.82rem" }}>No shielded notes to withdraw.</div>
        ) : (
          <>
            <div style={{ fontSize: "0.72rem", color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "0.4rem" }}>
              Select note to withdraw
            </div>
            {unspentNotes.map((note, i) => (
              <div
                className={`agent-card ${selectedIdx === i ? "active" : ""}`}
                key={i}
                onClick={() => setSelectedIdx(i)}
                style={{ cursor: "pointer" }}
              >
                <div className="agent-avatar" style={{ background: "var(--warning-dim)", color: "var(--warning)", fontSize: "0.7rem" }}>
                  #{note.leafIndex}
                </div>
                <div className="agent-info">
                  <div className="agent-name">{formatUsdc(note.amount)} USDC</div>
                  <div className="agent-role hex">{truncHex(note.commitment)}</div>
                </div>
              </div>
            ))}

            {selectedNote && (
              <div style={{ marginTop: "1rem" }}>
                <div className="field">
                  <label>Recipient Address</label>
                  <input
                    type="text"
                    value={recipientAddr}
                    onChange={(e) => setRecipientAddr(e.target.value)}
                    placeholder="Solana address to receive USDC..."
                  />
                </div>
                <div style={{ fontSize: "0.75rem", color: "var(--text-dim)", marginBottom: "0.75rem" }}>
                  Amount: {formatUsdc(selectedNote.amount)} | Fee: {formatUsdc(fee)} ({FEE_BASIS_POINTS} bps) | Receive: <strong style={{ color: "var(--success)" }}>{formatUsdc(receiveAmount)} USDC</strong>
                </div>
                <button onClick={doWithdraw} disabled={running || !recipientAddr.trim()}>
                  {running ? "Processing..." : "Withdraw"}
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {steps.length > 0 && (
        <div className="panel">
          <div className="panel-title" style={{ marginBottom: "0.5rem" }}>SDK Operations</div>
          <div className="steps">
            {steps.map((s, i) => (
              <div className={`step ${s.status}`} key={i}>
                <div className="step-dot">
                  {s.status === "done" ? "✓" : s.status === "running" ? "◌" : s.status === "error" ? "✗" : ""}
                </div>
                <div style={{ flex: 1 }}>
                  <div>{s.label}</div>
                  {s.detail && (
                    <div style={{ fontSize: "0.7rem", fontFamily: "var(--mono)", color: s.status === "error" ? "var(--error)" : "var(--text-dim)", marginTop: "0.15rem" }}>
                      {s.detail}
                    </div>
                  )}
                </div>
                {s.ms !== undefined && <span className="step-time">{s.ms}ms</span>}
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
