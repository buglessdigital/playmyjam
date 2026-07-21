// iyzipay resmi SDK'sının CommonJS gövdesi için minimal ambient tip.
// @types/iyzipay (DefinitelyTyped) checkoutFormInitialize.create çağrısına
// paymentCard/installments zorunlu kılıyor — iyzico'nun barındırdığı Checkout
// Form'da bu alanlar hiç kullanılmıyor (kart bilgisi bize gelmiyor). Bu yüzden
// modül burada elle, dar kapsamlı tanımlanıyor; asıl request/response tipleri
// lib/iyzico.ts içinde tanımlı.
declare module "iyzipay" {
  interface IyzipayConfigOptions {
    apiKey: string;
    secretKey: string;
    uri: string;
  }

  class Iyzipay {
    constructor(config: IyzipayConfigOptions);
    static LOCALE: { TR: "TR"; EN: "EN" };
    checkoutFormInitialize: {
      create(
        data: Record<string, unknown>,
        callback: (err: Error | null, result: Record<string, unknown>) => void
      ): void;
    };
    checkoutForm: {
      retrieve(
        data: { locale: "TR" | "EN"; token: string },
        callback: (err: Error | null, result: Record<string, unknown>) => void
      ): void;
    };
  }

  export default Iyzipay;
}
