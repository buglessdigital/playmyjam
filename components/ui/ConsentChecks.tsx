"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useT } from "@/lib/i18n";

export interface ConsentState {
  kvkk: boolean;
  terms: boolean;
  marketing: boolean;
}

export const EMPTY_CONSENTS: ConsentState = { kvkk: false, terms: false, marketing: false };

/** Zorunlu kutuların ikisi de işaretli mi. */
export const consentsSatisfied = (c: ConsentState) => c.kvkk && c.terms;

// Sözlükteki "{link}" yer tutucusunu gerçek bağlantıyla değiştirir; cümle
// kurgusu dile göre değişebildiği için metnin neresinde olduğu sabit değil.
function withLink(template: string, link: ReactNode): ReactNode {
  const [before, after = ""] = template.split("{link}");
  return (
    <>
      {before}
      {link}
      {after}
    </>
  );
}

function Row({
  checked,
  onChange,
  badge,
  badgeTone,
  children,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  badge: string;
  badgeTone: "required" | "optional";
  children: ReactNode;
}) {
  return (
    <label className="flex gap-3 cursor-pointer select-none">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-4 w-4 flex-shrink-0 accent-[#e91e8c]"
      />
      <span className="text-xs leading-relaxed text-[#9ca3af]">
        {children}{" "}
        <span
          className={`ml-1 rounded px-1.5 py-0.5 text-[10px] font-semibold ${
            badgeTone === "required"
              ? "bg-[#e91e8c]/15 text-[#e91e8c]"
              : "bg-white/10 text-[#6b7280]"
          }`}
        >
          {badge}
        </span>
      </span>
    </label>
  );
}

/**
 * Üyelik onayları. KVKK aydınlatma ve kullanım şartları zorunlu; ticari
 * elektronik ileti izni isteğe bağlı — 6563 sayılı Kanun uyarınca hizmetin
 * şartı hâline getirilemez ve işaretli gelemez.
 */
export default function ConsentChecks({
  value,
  onChange,
}: {
  value: ConsentState;
  onChange: (next: ConsentState) => void;
}) {
  const t = useT();
  const linkClass = "font-semibold text-[#e91e8c] underline underline-offset-2";
  const set = (patch: Partial<ConsentState>) => onChange({ ...value, ...patch });

  return (
    <div className="space-y-3 rounded-2xl border border-white/10 bg-white/5 p-4">
      <Row
        checked={value.kvkk}
        onChange={(next) => set({ kvkk: next })}
        badge={t.login.consentRequired}
        badgeTone="required"
      >
        {withLink(
          t.login.consentKvkk,
          <Link href="/kvkk" target="_blank" className={linkClass}>
            {t.login.consentKvkkLink}
          </Link>
        )}
      </Row>

      <Row
        checked={value.terms}
        onChange={(next) => set({ terms: next })}
        badge={t.login.consentRequired}
        badgeTone="required"
      >
        {withLink(
          t.login.consentTerms,
          <>
            <Link href="/terms" target="_blank" className={linkClass}>
              {t.login.consentTermsLink}
            </Link>{" "}
            {t.login.consentAnd}{" "}
            <Link href="/privacy" target="_blank" className={linkClass}>
              {t.login.consentPrivacyLink}
            </Link>
          </>
        )}
      </Row>

      <Row
        checked={value.marketing}
        onChange={(next) => set({ marketing: next })}
        badge={t.login.consentOptional}
        badgeTone="optional"
      >
        {withLink(
          t.login.consentMarketing,
          <Link href="/ticari-ileti" target="_blank" className={linkClass}>
            {t.login.consentMarketingLink}
          </Link>
        )}
      </Row>
    </div>
  );
}
