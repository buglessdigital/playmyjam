export default function BrowseLoading() {
  return (
    <div className="min-h-dvh w-full bg-[#0f0a18]">
      <div className="px-5 pb-3 pt-12">
        <div className="mb-3 flex items-center justify-between">
          <div className="h-6 w-24 animate-pulse rounded-lg bg-white/10" />
          <div className="h-8 w-16 animate-pulse rounded-full bg-white/10" />
        </div>
        <div className="flex gap-2">
          <div className="h-12 flex-1 animate-pulse rounded-2xl bg-white/10" />
          <div className="h-12 w-12 shrink-0 animate-pulse rounded-2xl bg-white/10" />
        </div>
      </div>

      <div className="pt-4">
        <div className="mx-5 mb-6 h-[76px] animate-pulse rounded-2xl bg-white/10" />

        <div className="mb-6">
          <div className="mb-3 ml-5 h-5 w-36 animate-pulse rounded-lg bg-white/10" />
          <div className="flex gap-3 overflow-hidden px-5">
            {[1, 2, 3].map((i) => (
              <div key={i} className="w-[140px] shrink-0">
                <div className="h-[140px] w-[140px] animate-pulse rounded-2xl bg-white/10" />
                <div className="mt-2 h-3.5 w-4/5 animate-pulse rounded bg-white/10" />
                <div className="mt-1.5 h-3 w-1/2 animate-pulse rounded bg-white/5" />
              </div>
            ))}
          </div>
        </div>

        <div className="mb-6">
          <div className="mb-3 ml-5 h-5 w-24 animate-pulse rounded-lg bg-white/10" />
          <div className="flex gap-4 overflow-hidden px-5">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="flex w-16 shrink-0 flex-col items-center gap-1.5">
                <div className="h-16 w-16 animate-pulse rounded-full bg-white/10" />
                <div className="h-2.5 w-12 animate-pulse rounded bg-white/5" />
              </div>
            ))}
          </div>
        </div>

        <div className="px-5 pb-32">
          <div className="mb-4 h-5 w-28 animate-pulse rounded-lg bg-white/10" />
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="flex items-center gap-3 border-b border-white/5 py-3.5">
              <div className="h-14 w-14 shrink-0 animate-pulse rounded-xl bg-white/10" />
              <div className="flex flex-1 flex-col gap-2">
                <div className="h-3.5 w-2/3 animate-pulse rounded bg-white/10" />
                <div className="h-3 w-2/5 animate-pulse rounded bg-white/5" />
              </div>
              <div className="h-9 w-9 shrink-0 animate-pulse rounded-full bg-white/10" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
