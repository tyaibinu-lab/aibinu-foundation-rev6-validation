import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Aibinu Flexiprep — Global Learning Platform" },
      {
        name: "description",
        content:
          "Aibinu Flexiprep Global Learning Platform — engineering baseline shell. Modules: Student Management, NoteBank, CBT, Virtual Laboratory, AICAS, Finance, Analytics, Communication, Offline.",
      },
      { property: "og:title", content: "Aibinu Flexiprep — Global Learning Platform" },
      {
        property: "og:description",
        content:
          "Engineering baseline shell for the Aibinu Flexiprep Global Learning Platform.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Index,
});

const modules = [
  { name: "Student Management", status: "Baseline" },
  { name: "Academic / NoteBank", status: "Baseline" },
  { name: "Reviewer Workflow", status: "Baseline" },
  { name: "CBT Examinations", status: "Baseline" },
  { name: "Virtual Laboratory", status: "Baseline" },
  { name: "AICAS Intelligence", status: "Baseline" },
  { name: "Finance", status: "Baseline" },
  { name: "Analytics", status: "Baseline" },
  { name: "Communication", status: "Baseline" },
  { name: "Offline", status: "Baseline" },
];

function Index() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="border-b border-border">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between px-4 py-4 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary text-sm font-bold text-primary-foreground">
              AF
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">Aibinu Flexiprep</p>
              <p className="text-xs text-muted-foreground">Global Learning Platform</p>
            </div>
          </div>
          <span className="rounded-full border border-border bg-secondary px-3 py-1 text-xs font-medium text-secondary-foreground">
            Engineering Baseline
          </span>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-10 sm:px-6 sm:py-14">
        <section className="max-w-2xl">
          <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            Platform shell established
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground sm:text-base">
            This is the controlled engineering baseline for the Aibinu Flexiprep
            Global Learning Platform. Architecture, security, database, and
            module documentation are in place. No database is connected and no
            business logic is implemented yet — the next approved gate is
            Supabase preflight, followed by migration 001.
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <Link to="/notebank" className="inline-flex rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">Open NoteBank</Link>
            <Link to="/questionbank" className="inline-flex rounded-md border border-primary px-4 py-2 text-sm font-medium text-primary">Open Question Bank</Link>
          </div>
        </section>

        <section className="mt-10">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Platform modules
          </h2>
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {modules.map((m) => (
              <div
                key={m.name}
                className="rounded-lg border border-border bg-card p-4"
              >
                <p className="text-sm font-medium text-card-foreground">{m.name}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {m.status} — not yet implemented
                </p>
              </div>
            ))}
          </div>
        </section>
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto w-full max-w-5xl px-4 py-4 sm:px-6">
          <p className="text-xs text-muted-foreground">
            Aibinu Flexiprep — controlled engineering project. Gate 0 complete;
            Gate 1 (Supabase preflight) requires explicit approval.
          </p>
        </div>
      </footer>
    </div>
  );
}
