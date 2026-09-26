"use client";

import { useEffect } from "react";

// Kök layout'un kendisi çökerse devreye girer ve onun yerine geçer: ne
// LanguageProvider ne globals.css vardır, bu yüzden metin iki dilli ve stil satır içi.
export default function GlobalError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="tr">
      <body style={{ margin: 0, background: "#0f0a18", color: "white", fontFamily: "system-ui, sans-serif" }}>
        <title>PlayMyJam</title>
        <main style={{ minHeight: "100dvh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
          <div style={{ maxWidth: 420 }}>
            <h1 style={{ fontSize: 24, margin: 0 }}>Bir şeyler ters gitti</h1>
            <p style={{ color: "#9ca3af", fontSize: 15, lineHeight: 1.6 }}>
              Something went wrong. Please try again.
            </p>
            <button
              type="button"
              onClick={() => unstable_retry()}
              style={{ marginTop: 16, padding: "10px 20px", borderRadius: 12, border: "none", background: "#9333ea", color: "white", fontSize: 14, fontWeight: 600, cursor: "pointer" }}
            >
              Tekrar dene / Try again
            </button>
            {error.digest && <p style={{ marginTop: 32, fontSize: 12, color: "#4b5563" }}>{error.digest}</p>}
          </div>
        </main>
      </body>
    </html>
  );
}
