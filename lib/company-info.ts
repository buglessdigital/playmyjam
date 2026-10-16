// Tosla İşim / sanal POS başvurusu için sitede görünmesi zorunlu satıcı bilgileri.
// Mekan sözleşmesinde taraf ve fatura unvanı tradeName (Bugless Digital).
export const COMPANY = {
  brand: "PlayMyJam",
  legalName: "Taner Yıldırım",
  tradeName: "Bugless Digital",
  // Vergi levhasındaki bilgiler (mekan sözleşmesinin taraf bilgisi)
  taxOffice: "Ege",
  taxNumber: "9591047099",
  legalAddress: "Rafetpaşa Mah. Yıldırım Beyazıt Cad. No:226A, Bornova / İZMİR",
  email: "taneryildirim@playmyjam.com.tr",
  phone: "+90 544 312 77 98",
  // Ofis / yazışma adresi (sitede görünen)
  address:
    "Üniversite Caddesi, No:37-39, Ağaçlı Yol, Bornova / İZMİR — Yaşar Üniversitesi Y Blok Minerva Kuluçka Merkezi",
  city: "Türkiye",
} as const;
