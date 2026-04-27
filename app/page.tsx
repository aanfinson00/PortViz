import Link from "next/link";

export default function LandingPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col justify-center px-6 py-16">
      <p className="text-sm font-semibold uppercase tracking-wider text-neutral-500">
        PortViz
      </p>
      <h1 className="mt-3 text-4xl font-bold tracking-tight sm:text-5xl">
        3D portfolio & lease visualization for commercial real estate.
      </h1>
      <p className="mt-6 max-w-2xl text-lg text-neutral-600">
        Drop pins for every project on a map, extrude buildings in 3D from their
        footprints, and demise spaces bay-by-bay to see how SF, frontage, dock
        doors, and parking redistribute in real time.
      </p>
      <div className="mt-10 flex flex-wrap gap-4">
        <Link
          href="/login"
          className="rounded-md bg-neutral-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-neutral-800"
        >
          Sign in
        </Link>
        <Link
          href="/signup"
          className="rounded-md border border-neutral-300 bg-white px-5 py-2.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
        >
          Create account
        </Link>
        <Link
          href="/app"
          className="self-center text-sm text-neutral-500 hover:text-neutral-800"
        >
          Already signed in? Open portfolio →
        </Link>
      </div>
    </main>
  );
}
