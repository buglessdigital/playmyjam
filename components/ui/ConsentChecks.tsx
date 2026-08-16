"use client";

import Link from "next/link";
import { Fragment, type ReactNode } from "react";
import { useT } from "@/lib/i18n";

export interface ConsentState {
  marketing: boolean;
}

export const EMPTY_CONSENTS: ConsentState = { marketing: false };

// Sözlükteki "{ad}" yer tutucularını gerçek bağlantılarla değiştirir; cümle
// kurgusu dile göre değiştiği için hangi bağlantının nerede olduğu sabit değil.
function withLinks(template: string, links: Record<string, ReactNode>): ReactNode {
  return template.split(/(\{\w+\})/).map((part, i) => {
    const key = part.startsWith("{") && part.endsWith("}") ? part.slice(1, -1) : null;
    const link = key ? links[key] : undefined;
    return <Fragment key={i}>{link ?? part}</Fragment>;
  });
}

/**
 * Üyelik onayları. KVKK aydınlatma metni, kullanım şartları ve gizlilik
 * politikası kayıt eyleminin kendisiyle kabul edilir — kutu işaretlenmez, metin
 * bilgilendirir ve sözleşmelere bağlantı verir. Ticari elektronik ileti izni
 * ise kutuda kalır: 6563 sayılı Kanun uyarınca hizmetin şartı hâline
 * getirilemez ve işaretli gelemez.
 */
export default function ConsentChecks({
  value,
  onChange,
  variant = "signup",
}: {
  value: ConsentState;
  onChange: (next: ConsentState) => void;
  /** Onayın hangi eylemle verildiği: kayıt ekranı mı, onay ekranındaki devam mı. */
  variant?: "signup" | "continue";
}) {
  const t = useT();
  const linkClass = "font-semibold text-[#e91e8c] underline underline-offset-2";

  return (
    <div className="space-y-3 rounded-2xl border border-white/10 bg-white/5 p-4">
      <p className="text-xs leading-relaxed text-[#9ca3af]">
        {withLinks(variant === "signup" ? t.login.consentNotice : t.login.consentNoticeContinue, {
          kvkk: (
            <Link href="/kvkk" target="_blank" className={linkClass}>
              {t.login.consentKvkkLink}
            </Link>
          ),
          terms: (
            <Link href="/terms" target="_blank" className={linkClass}>
              {t.login.consentTermsLink}
            </Link>
          ),
          privacy: (
            <Link href="/privacy" target="_blank" className={linkClass}>
              {t.login.consentPrivacyLink}
            </Link>
          ),
        })}
      </p>

      <label className="flex gap-3 cursor-pointer select-none border-t border-white/10 pt-3">
        <input
          type="checkbox"
          checked={value.marketing}
          onChange={(e) => onChange({ ...value, marketing: e.target.checked })}
          className="mt-0.5 h-4 w-4 flex-shrink-0 accent-[#e91e8c]"
        />
        <span className="text-xs leading-relaxed text-[#9ca3af]">
          {withLinks(t.login.consentMarketing, {
            link: (
              <Link href="/ticari-ileti" target="_blank" className={linkClass}>
                {t.login.consentMarketingLink}
              </Link>
            ),
          })}{" "}
          <span className="ml-1 rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-semibold text-[#6b7280]">
            {t.login.consentOptional}
          </span>
        </span>
      </label>
    </div>
  );
}
