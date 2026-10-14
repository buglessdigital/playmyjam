"use client";

import { useCallback, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { ScanLine } from "lucide-react";
import { isNativeApp, nativeHaptic, qrToVenuePath, scanQrCode } from "@/lib/native-app";
import { useT } from "@/lib/i18n";

const WebQrScanner = dynamic(() => import("./WebQrScanner"), { ssr: false });

// Masadaki plaketin karekodunu okutur ve mekanı açar. Uygulamada yerel
// tarayıcı eklentisi, tarayıcıda/PWA'da kamera (WebQrScanner). Çağıran
// useCanScanQr ile çizip çizmeyeceğine karar verir.
export default function ScanQrButton({ className, style }: { className?: string; style?: React.CSSProperties }) {
  const t = useT();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [webOpen, setWebOpen] = useState(false);

  const handle = useCallback(
    (text: string) => {
      const path = qrToVenuePath(text);
      if (!path) {
        nativeHaptic("error");
        alert(t.nativeApp.qrInvalid);
        return;
      }
      nativeHaptic("success");
      router.push(path);
    },
    [router, t]
  );

  const closeWeb = useCallback(() => setWebOpen(false), []);
  const onWebResult = useCallback(
    (text: string) => {
      setWebOpen(false);
      handle(text);
    },
    [handle]
  );

  const scan = async () => {
    if (busy) return;
    if (!isNativeApp()) {
      setWebOpen(true);
      return;
    }
    setBusy(true);
    try {
      const text = await scanQrCode({ instructions: t.nativeApp.qrInstructions, cancel: t.nativeApp.qrCancel });
      if (text) handle(text); // null: vazgeçildi
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button type="button" onClick={scan} disabled={busy} className={className} style={style}>
        <ScanLine size={16} className="shrink-0" />
        {t.nativeApp.qrScan}
      </button>
      {webOpen && <WebQrScanner onResult={onWebResult} onClose={closeWeb} />}
    </>
  );
}
