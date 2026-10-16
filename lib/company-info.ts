// Tosla İşim / sanal POS başvurusu için sitede görünmesi zorunlu satıcı bilgileri.
// Bugless Digital bir şahıs işletmesi: hukuki kişi Taner Yıldırım'ın kendisi.
export const COMPANY = {
  brand: "PlayMyJam",
  legalName: "Taner Yıldırım",
  tradeName: "Bugless Digital",
  // Vergi levhasındaki bilgiler (mekan sözleşmesinin taraf bilgisi)
  taxOffice: "",
  taxNumber: "9591047099",
  legalAddress: "Rafetpaşa Mah. Yıldırım Beyazıt Cad. No:226A, Bornova / İZMİR",
  email: "taneryildirim@playmyjam.com.tr",
  phone: "+90 544 312 77 98",
  // Ofis / yazışma adresi (sitede görünen)
  address:
    "Üniversite Caddesi, No:37-39, Ağaçlı Yol, Bornova / İZMİR — Yaşar Üniversitesi Y Blok Minerva Kuluçka Merkezi",
  city: "Türkiye",
} as const;
