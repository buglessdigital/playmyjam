"use client";

import { Component, type ReactNode } from "react";
import * as Sentry from "@sentry/nextjs";

// Mağaza uygulaması köprüsünün (NativeAppBridge, NativePush) hata sınırı.
//
// Köprü sayfanın asıl işi değil: derin bağlantı, push kaydı, hediye. 11 Eki
// 2026'da köprüdeki tek bir `.then is not a function` hatası app/error.tsx'e
// kadar çıkıp bütün sayfayı "Bir şeyler ters gitti" ekranına düşürmüştü (#47).
// Burada yakalanan hata yalnızca köprüyü kapatır; site çalışmaya devam eder,
// hata Sentry'ye gider. Tarayıcıda köprü zaten hiçbir şey yapmadığı için
// etkisi yalnızca uygulamada görülür.
export default class NativeErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    Sentry.captureException(error, { tags: { area: "native-bridge" } });
  }

  render() {
    return this.state.failed ? null : this.props.children;
  }
}
