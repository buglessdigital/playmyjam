import { after } from "next/server";

// Yanıtı bekletmeyen iş (bildirim, kayıt). after() ile koşar: sahipsiz bir
// promise Vercel yanıt dönünce fonksiyonu dondurduğunda yarıda kalabiliyordu.
// İstek bağlamı yoksa (script, test) after() fırlatır — o zaman düz koşar.
export function runInBackground(task: () => Promise<void>): void {
  try {
    after(task);
  } catch {
    void task();
  }
}
