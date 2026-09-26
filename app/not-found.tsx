"use client";

import Link from "next/link";
import { useT } from "@/lib/i18n";
import StatusScreen, { primaryButtonClass } from "@/components/ui/StatusScreen";

export default function NotFound() {
  const t = useT();
  return (
    <StatusScreen eyebrow="404" title={t.notFoundPage.title} desc={t.notFoundPage.desc}>
      <Link href="/" className={primaryButtonClass}>
        {t.errorPage.home}
      </Link>
    </StatusScreen>
  );
}
