import {
  useCreateWallet,
  useLoginWithEmail,
  useLoginWithSiwe,
  usePrivy,
  type WalletListEntry,
} from "@privy-io/react-auth";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
  getAddress,
  parseSignature,
  recoverMessageAddress,
  serializeSignature,
  toHex,
  type Hex,
} from "viem";
import { useDisconnect } from "wagmi";
import { robinhoodTestnet } from "../../lib/config";
import { dismissPrivyModals } from "../../lib/dismiss-privy";
import {
  installUrlFor,
  refreshInjectedProviders,
  resolveInjectedProvider,
  type Eip1193Provider,
} from "../../lib/injected-wallets";
import { FEATURED_WALLETS } from "../../lib/privy";
import { WalletBrandIcon } from "./wallet-icons";

/** Privy personal_sign encoding + EIP-155 v normalization. */
async function signSiweMessage(
  provider: Eip1193Provider,
  address: string,
  message: string,
): Promise<Hex> {
  const raw = (await provider.request({
    method: "personal_sign",
    // Match Privy’s ConnectedWallet.sign: toHex(message) + address
    params: [toHex(message), address.toLowerCase()],
  })) as Hex;

  const normalized = serializeSignature(parseSignature(raw));
  const recovered = await recoverMessageAddress({
    message,
    signature: normalized,
  });
  if (recovered.toLowerCase() !== address.toLowerCase()) {
    throw new Error(
      "Wallet signature did not match the connected address. Check the active account in your wallet and try again.",
    );
  }
  return normalized;
}

function privyWalletClientType(id: WalletListEntry): string | undefined {
  // Privy deprecated rabby_wallet in walletList; omit so auth metadata stays valid.
  if (id === "rabby_wallet") return undefined;
  return id;
}

type Props = {
  open: boolean;
  onClose: () => void;
};

export function ConnectModal({ open, onClose }: Props) {
  const { ready, authenticated } = usePrivy();

  useEffect(() => {
    if (authenticated && open) onClose();
  }, [authenticated, open, onClose]);

  useEffect(() => {
    if (!open) return;
    refreshInjectedProviders();
    // Never leave a Privy sheet under ours from a prior attempt
    dismissPrivyModals();
  }, [open]);

  function handleClose() {
    dismissPrivyModals();
    onClose();
  }

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div className="winx-connect-root" role="dialog" aria-modal="true" aria-label="Log in or sign up">
      <button type="button" className="winx-connect-backdrop" aria-label="Close" onClick={handleClose} />
      <div className="winx-connect-sheet">
        <div className="winx-connect-header">
          <h2 className="winx-connect-title">Log in or sign up</h2>
          <button type="button" className="winx-connect-close" aria-label="Close" onClick={handleClose}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path
                d="M18 6 6 18M6 6l12 12"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>

        {!ready ? (
          <p className="winx-connect-loading">Loading…</p>
        ) : (
          <ConnectModalBody onClose={handleClose} />
        )}
      </div>
    </div>,
    document.body,
  );
}

async function requestAccounts(provider: Eip1193Provider): Promise<string> {
  const accounts = (await provider.request({
    method: "eth_requestAccounts",
  })) as string[];
  if (!accounts?.[0]) throw new Error("No account returned from wallet");
  return accounts[0];
}

async function ensureChain(provider: Eip1193Provider) {
  const chainIdHex = `0x${robinhoodTestnet.id.toString(16)}`;
  try {
    await provider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: chainIdHex }],
    });
  } catch {
    await provider.request({
      method: "wallet_addEthereumChain",
      params: [
        {
          chainId: chainIdHex,
          chainName: robinhoodTestnet.name,
          nativeCurrency: robinhoodTestnet.nativeCurrency,
          rpcUrls: [...robinhoodTestnet.rpcUrls.default.http],
          blockExplorerUrls: robinhoodTestnet.blockExplorers?.default?.url
            ? [robinhoodTestnet.blockExplorers.default.url]
            : [],
        },
      ],
    });
  }

  const chainHex = (await provider.request({ method: "eth_chainId" })) as string;
  const onChain = Number.parseInt(chainHex, 16);
  if (onChain !== robinhoodTestnet.id) {
    throw new Error("Please switch to Robinhood testnet in your wallet, then try again.");
  }
}

function ConnectModalBody({ onClose }: { onClose: () => void }) {
  const { sendCode, loginWithCode, state: emailState } = useLoginWithEmail();
  const { createWallet } = useCreateWallet();
  const { generateSiweMessage, loginWithSiwe } = useLoginWithSiwe();
  const { disconnectAsync } = useDisconnect();

  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"email" | "code">("email");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [activeWallet, setActiveWallet] = useState<WalletListEntry | null>(null);

  async function run(fn: () => Promise<void>) {
    setError(null);
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Something went wrong";
      if (/reject|denied|cancel/i.test(msg)) {
        setError("Connection cancelled in wallet");
      } else if (/siwe|signature/i.test(msg)) {
        setError("Sign-in failed. Try again and approve the message in your wallet.");
      } else {
        setError(msg);
      }
      dismissPrivyModals();
      try {
        await disconnectAsync();
      } catch {
        // ignore
      }
    } finally {
      setBusy(false);
      setActiveWallet(null);
    }
  }

  async function loginWithInjected(id: WalletListEntry) {
    // Whitelabel SIWE — never opens Privy’s “Select your wallet” sheet
    dismissPrivyModals();

    const resolved = resolveInjectedProvider(id);
    if (!resolved) {
      const url = installUrlFor(id);
      throw new Error(
        url
          ? `Wallet not detected. Unlock/enable the extension, or install from ${url}.`
          : "Wallet extension not detected. Unlock it and try again.",
      );
    }

    const { provider } = resolved;
    // EIP-55 checksum is required for Privy SIWE verification
    const address = getAddress(await requestAccounts(provider));
    await ensureChain(provider);

    // Always bind SIWE to Robinhood testnet (app’s only supported chain)
    const message = await generateSiweMessage({
      address,
      chainId: `eip155:${robinhoodTestnet.id}`,
    });
    const signature = await signSiweMessage(provider, address, message);

    await loginWithSiwe({
      message,
      signature,
      walletClientType: privyWalletClientType(id),
      connectorType: "injected",
    });
    dismissPrivyModals();
    onClose();
  }

  function connect(wallet: WalletListEntry) {
    setActiveWallet(wallet);
    void run(async () => {
      await loginWithInjected(wallet);
    });
  }

  const sending = emailState.status === "sending-code" || emailState.status === "submitting-code";

  return (
    <div className="winx-connect-body">
      {step === "email" ? (
        <form
          className="winx-connect-email"
          onSubmit={(e) => {
            e.preventDefault();
            if (!email.trim()) return;
            void run(async () => {
              await sendCode({ email: email.trim() });
              setStep("code");
            });
          }}
        >
          <input
            type="email"
            autoComplete="email"
            placeholder="Enter your email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="winx-connect-input"
            disabled={busy || sending}
          />
          <button
            type="submit"
            className="winx-connect-continue"
            disabled={busy || sending || !email.trim()}
          >
            {sending ? "Sending…" : "Continue"}
          </button>
        </form>
      ) : (
        <form
          className="winx-connect-email"
          onSubmit={(e) => {
            e.preventDefault();
            if (!code.trim()) return;
            void run(async () => {
              await loginWithCode({ code: code.trim() });
              try {
                await createWallet();
              } catch {
                // Already has a wallet — fine.
              }
              dismissPrivyModals();
              onClose();
            });
          }}
        >
          <p className="winx-connect-hint">
            Enter the code sent to <span>{email}</span>
          </p>
          <input
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="Verification code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            className="winx-connect-input"
            disabled={busy || sending}
          />
          <button
            type="submit"
            className="winx-connect-continue"
            disabled={busy || sending || !code.trim()}
          >
            {sending ? "Verifying…" : "Verify"}
          </button>
          <button
            type="button"
            className="winx-connect-back"
            onClick={() => {
              setStep("email");
              setCode("");
              setError(null);
            }}
          >
            Use a different email
          </button>
        </form>
      )}

      <div className="winx-connect-divider" />

      <ul className="winx-connect-wallets">
        {FEATURED_WALLETS.map((w) => (
          <li key={w.id}>
            <button
              type="button"
              className={`winx-connect-wallet-row${activeWallet === w.id ? " is-active" : ""}`}
              disabled={busy}
              onClick={() => connect(w.id)}
            >
              <WalletBrandIcon id={w.id} />
              <span className="winx-connect-wallet-name">{w.name}</span>
              {activeWallet === w.id && busy ? (
                <span className="winx-connect-wallet-tag">Check extension…</span>
              ) : (
                <svg
                  className="winx-connect-chevron"
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  aria-hidden
                >
                  <path
                    d="M9 6l6 6-6 6"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              )}
            </button>
          </li>
        ))}
      </ul>

      {error ? <p className="winx-connect-error">{error}</p> : null}
    </div>
  );
}
