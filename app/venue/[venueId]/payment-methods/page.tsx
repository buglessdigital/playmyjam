"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const MOCK_CARDS = [
  { id: "c1", brand: "Visa", last4: "4242", expiry: "12/26", isDefault: true },
  { id: "c2", brand: "Mastercard", last4: "5555", expiry: "09/25", isDefault: false },
];

export default function PaymentMethodsPage() {
  const router = useRouter();
  const [cards, setCards] = useState(MOCK_CARDS);
  const [showAddForm, setShowAddForm] = useState(false);

  const removeCard = (id: string) => {
    setCards((c) => c.filter((card) => card.id !== id));
  };

  const setDefault = (id: string) => {
    setCards((c) => c.map((card) => ({ ...card, isDefault: card.id === id })));
  };

  return (
    <div className="min-h-screen bg-[#0f0a18]">
      <div className="flex items-center gap-3 px-5 pt-12 pb-6">
        <button
          onClick={() => router.back()}
          className="w-9 h-9 flex items-center justify-center rounded-full bg-white/10"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
            <path d="M15 18l-6-6 6-6" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <h1 className="text-white font-bold text-xl">Ödeme Yöntemleri</h1>
      </div>

      {/* Kartlar */}
      <div className="px-5 space-y-3 mb-6">
        {cards.map((card) => (
          <div
            key={card.id}
            className="p-4 rounded-2xl"
            style={{
              background: card.isDefault
                ? "linear-gradient(145deg, rgba(233,30,140,0.15), rgba(139,92,246,0.08))"
                : "#1a0e2a",
              border: card.isDefault
                ? "1px solid rgba(233,30,140,0.3)"
                : "1px solid rgba(255,255,255,0.08)",
            }}
          >
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-3">
                <div
                  className="w-10 h-7 rounded flex items-center justify-center text-xs font-black"
                  style={{
                    background: card.brand === "Visa" ? "#1a1f71" : "#eb001b",
                    color: "white",
                  }}
                >
                  {card.brand === "Visa" ? "VISA" : "MC"}
                </div>
                <div>
                  <p className="text-white font-semibold text-sm">
                    •••• •••• •••• {card.last4}
                  </p>
                  <p className="text-[#6b7280] text-xs">Son kullanma: {card.expiry}</p>
                </div>
              </div>
              {card.isDefault && (
                <span
                  className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                  style={{ background: "rgba(233,30,140,0.2)", color: "#e91e8c" }}
                >
                  VARSAYILAN
                </span>
              )}
            </div>
            <div className="flex gap-2">
              {!card.isDefault && (
                <button
                  onClick={() => setDefault(card.id)}
                  className="flex-1 py-2 rounded-xl text-xs font-semibold border border-white/10 text-[#9ca3af] hover:bg-white/5 transition-all"
                >
                  Varsayılan Yap
                </button>
              )}
              <button
                onClick={() => removeCard(card.id)}
                className="flex-1 py-2 rounded-xl text-xs font-semibold border border-red-500/20 text-red-400 hover:bg-red-500/10 transition-all"
              >
                Sil
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Yeni Kart Ekle */}
      <div className="px-5">
        {!showAddForm ? (
          <button
            onClick={() => setShowAddForm(true)}
            className="w-full py-4 rounded-2xl font-bold text-white border-2 border-dashed border-white/20 hover:border-[#e91e8c]/40 hover:bg-white/5 transition-all flex items-center justify-center gap-2"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <path d="M12 5v14M5 12h14" stroke="white" strokeWidth="2" strokeLinecap="round" />
            </svg>
            Yeni Kart Ekle
          </button>
        ) : (
          <div className="p-5 rounded-2xl" style={{ background: "#1a0e2a" }}>
            <h3 className="text-white font-bold mb-4">Kart Bilgileri</h3>
            <div className="space-y-3">
              <input
                type="text"
                placeholder="Kart numarası"
                maxLength={19}
                className="w-full bg-[#0f0a18] border border-white/10 rounded-xl py-3 px-4 text-white placeholder-[#4b5563] text-sm focus:outline-none focus:border-[#e91e8c]/40"
              />
              <div className="flex gap-3">
                <input
                  type="text"
                  placeholder="AA/YY"
                  maxLength={5}
                  className="flex-1 min-w-0 bg-[#0f0a18] border border-white/10 rounded-xl py-3 px-4 text-white placeholder-[#4b5563] text-sm focus:outline-none focus:border-[#e91e8c]/40"
                />
                <input
                  type="text"
                  placeholder="CVV"
                  maxLength={3}
                  className="flex-1 min-w-0 bg-[#0f0a18] border border-white/10 rounded-xl py-3 px-4 text-white placeholder-[#4b5563] text-sm focus:outline-none focus:border-[#e91e8c]/40"
                />
              </div>
              <input
                type="text"
                placeholder="Kart sahibinin adı"
                className="w-full bg-[#0f0a18] border border-white/10 rounded-xl py-3 px-4 text-white placeholder-[#4b5563] text-sm focus:outline-none focus:border-[#e91e8c]/40"
              />
              <div className="flex gap-3 pt-1">
                <button
                  onClick={() => setShowAddForm(false)}
                  className="flex-1 py-3 rounded-xl font-semibold text-[#9ca3af] border border-white/10 text-sm"
                >
                  İptal
                </button>
                <button
                  onClick={() => setShowAddForm(false)}
                  className="flex-1 py-3 rounded-xl font-bold text-white text-sm"
                  style={{ background: "linear-gradient(135deg, #e91e8c, #c2185b)" }}
                >
                  Kaydet
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
