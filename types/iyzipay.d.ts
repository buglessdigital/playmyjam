// iyzipay resmi SDK'sının CommonJS gövdesi için minimal ambient tip.
// @types/iyzipay (DefinitelyTyped) checkoutFormInitialize.create çağrısına
// paymentCard/installments zorunlu kılıyor — iyzico'nun barındırdığı Checkout
// Form'da bu alanlar hiç kullanılmıyor (kart bilgisi bize gelmiyor). Ayrıca ana
// `Iyzipay` sınıfı ~50 kaynağı dinamik require ile yüklüyor (Turbopack/file-tracing
// ile uyumsuz — bkz lib/iyzico.ts), bu yüzden sadece kullandığımız iki alt modül
// (CheckoutFormInitialize, CheckoutForm) burada elle, dar kapsamlı tanımlanıyor.

interface IyzicoResourceConfig {
  apiKey: string;
  secretKey: string;
  uri: string;
}

declare module "iyzipay/lib/resources/CheckoutFormInitialize" {
  const CheckoutFormInitializeResource: new (config: IyzicoResourceConfig) => {
    create(data: unknown, callback: (err: Error | null, result: unknown) => void): void;
  };
  export default CheckoutFormInitializeResource;
}

declare module "iyzipay/lib/resources/CheckoutForm" {
  const CheckoutFormResource: new (config: IyzicoResourceConfig) => {
    retrieve(data: unknown, callback: (err: Error | null, result: unknown) => void): void;
  };
  export default CheckoutFormResource;
}
