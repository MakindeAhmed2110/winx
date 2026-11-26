"use client";

import { useState } from "react";

export const WINX_TOKEN = "0x955a96c53ae684182091e64ddc6c60356de701d3";

const EXPLORER = `https://robinhoodchain.blockscout.com/token/${WINX_TOKEN}`;

const SHORT = `${WINX_TOKEN.slice(0, 6)}…${WINX_TOKEN.slice(-4)}`;

export function WinxCa({ placement = "footer" }: { placement?: "nav" | "footer" }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(WINX_TOKEN);
    } catch {
      const input = document.createElement("textarea");
      input.value = WINX_TOKEN;
      input.setAttribute("readonly", "");
      input.style.position = "fixed";
      input.style.left = "-9999px";
      document.body.appendChild(input);
      input.select();
      const ok = document.execCommand("copy");
      input.remove();
      if (!ok) return;
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };

  const nav = placement === "nav";

  return (
    <div className={`winx-ca ${nav ? "winx-ca-nav" : ""}`}>
      <span className="winx-ca-label">{nav ? "$WINX" : "$WINX on Robinhood"}</span>
      <code>{nav ? SHORT : WINX_TOKEN}</code>
      <span className="winx-ca-actions">
        <button type="button" onClick={() => void copy()}>
          {copied ? "Copied" : "Copy"}
        </button>
        {nav ? null : (
          <a href={EXPLORER} target="_blank" rel="noreferrer">
            Explorer
          </a>
        )}
      </span>
    </div>
  );
}
