"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";
import Link from "next/link";
import { useT } from "@/lib/i18n";
import StatusScreen, { primaryButtonClass, secondaryButtonClass } from "@/components/ui/StatusScreen";

// Kök layout'un altındaki her segmentte yakalanmamış hata buraya düşer. Sunucu
// hatalarında mesaj gizlenir; digest, Vercel loglarındaki kayıtla eşleştirmek içindir.
export default function RouteError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  const t = useT();

  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <StatusScreen
      eyebrow="500"
      title={t.errorPage.title}
      desc={t.errorPage.desc}
      footnote={error.digest ? `${t.errorPage.ref}: ${error.digest}` : undefined}
    >
      <button type="button" onClick={() => retry()} className={primaryButtonClass}>
        {t.common.retry}
      </button>
      <Link href="/" className={secondaryButtonClass}>
        {t.errorPage.home}
      </Link>
    </StatusScreen>
  );
}
