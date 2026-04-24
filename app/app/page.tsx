export default function PortfolioMapPage() {
  return (
    <main className="flex min-h-screen flex-col">
      <header className="flex items-center justify-between border-b border-neutral-200 bg-white px-6 py-4">
        <div>
          <h1 className="text-lg font-semibold">Portfolio</h1>
          <p className="text-sm text-neutral-500">
            Map of all projects across your organization.
          </p>
        </div>
        <div className="flex gap-2">
          <button className="rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50">
            Filter
          </button>
          <button className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-neutral-800">
            New project
          </button>
        </div>
      </header>
      <section className="grid flex-1 grid-cols-1 lg:grid-cols-[360px_1fr]">
        <aside className="border-r border-neutral-200 bg-white p-4">
          <p className="text-sm text-neutral-500">
            No projects yet. Create one to drop it on the map.
          </p>
        </aside>
        <div className="flex items-center justify-center bg-neutral-100 text-sm text-neutral-400">
          Map placeholder — Mapbox GL view will mount here in Phase 2.
        </div>
      </section>
    </main>
  );
}
