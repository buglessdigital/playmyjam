import { expect, type Page } from "@playwright/test";

// iyzico sandbox test kartları: https://docs.iyzico.com/ek-bilgiler/test-kartlari
export const CARDS = {
  success: "5528790000000008",
  // "Yetersiz bakiye" ile reddedilir
  insufficientFunds: "4111111111111129",
};

/** iyzico'nun barındırdığı ödeme formunu doldurup öder (3D Secure kapalı). */
export async function payOnIyzico(page: Page, cardNumber: string) {
  await page.waitForURL(/sandbox-cpp\.iyzipay\.com/, { timeout: 30_000 });
  await page.locator("#ccname").fill("Test Musteri");
  // Alanlar maskeli: fill yerine tuş tuş yazılmazsa form değeri kabul etmiyor
  await page.locator("#ccnumber").pressSequentially(cardNumber);
  await page.locator("#ccexpmonth").pressSequentially("12");
  await page.locator("#ccexpyear").pressSequentially("30");
  await page.locator("#cccvc").pressSequentially("123");
  const pay = page.getByRole("button", { name: /ÖDE/ });
  await expect(pay).toBeEnabled();
  await pay.click();
}
