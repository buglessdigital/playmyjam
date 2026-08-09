"use client";

import { Suspense, use, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { safeNextPath } from "@/lib/venue-gate";
import { useT } from "@/lib/i18n";
import ConsentChecks, { EMPTY_CONSENTS, consentsSatisfied } from "@/components/ui/ConsentChecks";

interface Props {
  params: Promise<{ venueId: string }>;
}

// Onayı eksik hesapların uğrağı: Google ile giriş modundan gelen ilk kayıtlar ve
// onay kutuları eklenmeden önce kaydolmuş ama migration backfill'ine takılmamış
// hesaplar. Normal kayıt akışı buraya düşmez — onaylar kayıt ekranında alınır.
export default function ConsentPage({ params }: Props) {
  return (
    <Suspense fallback={null}>
      <ConsentPageContent params={params} />
    </Suspense>
  );
}

function ConsentPageContent({ params }: Props) {
  const { venueId } = use(params);
  const router = useRouter();
  const searchParams = useSearchParams();
  const t = useT();
  const [consents, setConsents] = useState(EMPTY_CONSENTS);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const nextPath = safeNextPath(searchParams.get("next"), venueId);

  const handleSubmit = async () => {
    if (!consentsSatisfied(consents) || saving) return;
    setSaving(true);
    setError("");
    const supabase = createClient();
    const { error: rpcError } = await supabase.rpc("record_consents", {
      p_marketing: consents.marketing,
    });
    if (rpcError) {
      setError(t.consent.error);
      setSaving(false);
      return;
    }
    router.replace(nextPath);
  };

  return (
    <div className="min-h-screen bg-[#0f0a18] max-w-md mx-auto px-6 pt-12 pb-10">
      <h1 className="text-2xl font-bold text-white mb-2">{t.consent.title}</h1>
      <p className="text-[#9ca3af] text-sm mb-6">{t.consent.sub}</p>

      {error && (
        <div className="mb-4 px-4 py-2.5 rounded-xl text-sm text-red-400 bg-red-500/10 border border-red-500/20">
          {error}
        </div>
      )}

      <ConsentChecks value={consents} onChange={setConsents} />

      <button
        onClick={handleSubmit}
        disabled={saving || !consentsSatisfied(consents)}
        className="mt-6 block w-full text-center py-3.5 rounded-2xl font-bold text-white text-base transition-all active:scale-95 disabled:opacity-50"
        style={{ background: "linear-gradient(135deg, #e91e8c, #c2185b)" }}
      >
        {saving ? t.consent.saving : t.consent.submit}
      </button>
    </div>
  );
}
