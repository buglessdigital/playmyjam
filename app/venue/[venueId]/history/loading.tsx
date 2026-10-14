export default function HistoryLoading() {
  return (
    <div style={{ background: "var(--pmj-bg)", minHeight: "100dvh", width: "100%" }}>
      <div style={{ padding: "48px 20px 16px" }}>
        <div style={{ height: 24, width: 170, borderRadius: 8, background: "rgb(var(--pmj-ink-rgb) / 0.1)" }} className="animate-pulse" />
      </div>

      <div style={{ padding: "0 20px 120px", display: "flex", flexDirection: "column", gap: 0 }}>
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 0", borderBottom: "1px solid rgb(var(--pmj-ink-rgb) / 0.06)" }}>
            <div style={{ width: 56, height: 56, borderRadius: 12, flexShrink: 0, background: "rgb(var(--pmj-ink-rgb) / 0.08)" }} className="animate-pulse" />
            <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ height: 14, width: "65%", borderRadius: 6, background: "rgb(var(--pmj-ink-rgb) / 0.1)" }} className="animate-pulse" />
              <div style={{ height: 12, width: "45%", borderRadius: 6, background: "rgb(var(--pmj-ink-rgb) / 0.06)" }} className="animate-pulse" />
            </div>
            <div style={{ width: 64, height: 20, borderRadius: 10, background: "rgb(var(--pmj-ink-rgb) / 0.08)", flexShrink: 0 }} className="animate-pulse" />
          </div>
        ))}
      </div>
    </div>
  );
}
