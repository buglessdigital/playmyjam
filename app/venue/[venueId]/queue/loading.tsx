export default function QueueLoading() {
  return (
    <div className="min-h-screen bg-canvas">
      <div className="flex items-center justify-between px-5 pt-12 pb-4">
        <div className="h-6 w-32 rounded-lg bg-ink/10 animate-pulse" />
      </div>

      <div className="mx-5 mb-4 rounded-2xl overflow-hidden bg-surface h-16 animate-pulse" />

      <div className="mx-5 rounded-3xl p-5 mb-5 animate-pulse" style={{ background: "var(--pmj-surface)", border: "1px solid rgba(233,30,140,0.15)" }}>
        <div className="flex flex-col items-center gap-4">
          <div className="w-40 h-40 rounded-full bg-ink/10" />
          <div className="h-6 w-48 rounded-lg bg-ink/10" />
          <div className="h-4 w-32 rounded-lg bg-ink/10" />
          <div className="w-full h-1 rounded-full bg-ink/10" />
        </div>
      </div>

      <div className="px-5 space-y-2">
        {[1, 2, 3].map((i) => (
          <div key={i} className="flex items-center gap-3 p-3 rounded-2xl bg-surface animate-pulse">
            <div className="w-12 h-12 rounded-xl bg-ink/10 flex-shrink-0" />
            <div className="flex-1 space-y-2">
              <div className="h-4 w-3/4 rounded bg-ink/10" />
              <div className="h-3 w-1/2 rounded bg-ink/10" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
