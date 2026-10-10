"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ScanLine } from "lucide-react";
import { nativeHaptic, qrToVenuePath, scanQrCode } from "@/lib/native-app";
import { useT } from "@/lib/i18n";

// Mağaza uygulamasında masadaki plaketin karekodunu okutur ve mekanı açar.
// Yalnızca uygulamada çizilir (çağıran useNativePlatform ile karar verir);
// tarayıcıda telefonun kendi kamerası zaten karekodu açıyor.
export default function ScanQrButton({ className, style }: { className?: string; style?: React.CSSProperties }) {
  const t = useT();
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const scan = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const text = await scanQrCode({ instructions: t.nativeApp.qrInstructions, cancel: t.nativeApp.qrCancel });
      if (!text) return; // vazgeçildi
      const path = qrToVenuePath(text);
      if (!path) {
        nativeHaptic("error");
        alert(t.nativeApp.qrInvalid);
        return;
      }
      nativeHaptic("success");
      router.push(path);
    } finally {
      setBusy(false);
    }
  };

  return (
    <button type="button" onClick={scan} disabled={busy} className={className} style={style}>
      <ScanLine size={16} className="shrink-0" />
      {t.nativeApp.qrScan}
    </button>
  );
}
