import { createFileRoute, Link } from "@tanstack/react-router";
import { AccountBar } from "@/components/auth/TenantGate";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Aibinu Flexiprep — Global Learning Platform" },
      {
        name: "description",
        content:
          "Aibinu Flexiprep Global Learning Platform — Student Management, NoteBank, CBT, Learning Progress, AI drafting and Finance for secondary schools.",
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

// Status reflects what is wired in the app; the database (RLS + functions) is the authority for every module.
const modules = [
  { name: "Student Management", status: "Live — students, guardians, classes" },
  { name: "Academic / NoteBank", status: "Live — notes with review workflow" },
  { name: "Reviewer Workflow", status: "Live — notes and questions" },
  { name: "CBT Examinations", status: "Live — exams, taking, marking, results" },
  { name: "Virtual Laboratory", status: "Planned — needs schema design gate" },
  { name: "AICAS Intelligence", status: "Live — learning progress, AI drafting (worker pending)" },
  { name: "Finance", status: "Live — fees, invoices, manual payments, refunds" },
  { name: "Analytics", status: "Partial — class topic maps in Learning Progress" },
  { name: "Communication", status: "Planned — needs schema design gate" },
  { name: "Offline", status: "Planned" },
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
          <AccountBar />
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-10 sm:px-6 sm:py-14">
        <section className="max-w-2xl">
          <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            Aibinu Flexiprep platform
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground sm:text-base">
            Curriculum-aligned teaching, assessment and school administration for
            WAEC, NECO and UTME preparation. Choose a module below. New here?{" "}
            <Link to="/welcome" className="font-medium text-primary underline underline-offset-4">Set up or join a school</Link>.
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <Link to="/students" className="inline-flex rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">Open Students</Link>
            <Link to="/notebank" className="inline-flex rounded-md border border-primary px-4 py-2 text-sm font-medium text-primary">Open NoteBank</Link>
            <Link to="/questionbank" className="inline-flex rounded-md border border-primary px-4 py-2 text-sm font-medium text-primary">Open Question Bank</Link>
            <Link to="/cbt" className="inline-flex rounded-md border border-primary px-4 py-2 text-sm font-medium text-primary">Open CBT Exams</Link>
            <Link to="/curriculum" className="inline-flex rounded-md border border-primary px-4 py-2 text-sm font-medium text-primary">Open Curriculum Bank</Link>
            <Link to="/finance" className="inline-flex rounded-md border border-primary px-4 py-2 text-sm font-medium text-primary">Open Finance</Link>
            <Link to="/learning" className="inline-flex rounded-md border border-primary px-4 py-2 text-sm font-medium text-primary">Open Learning Progress</Link>
            <Link to="/ai" className="inline-flex rounded-md border border-primary px-4 py-2 text-sm font-medium text-primary">Open AI Drafting</Link>
            <Link to="/members" className="inline-flex rounded-md border border-primary px-4 py-2 text-sm font-medium text-primary">People & Invitations</Link>
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
                  {m.status}
                </p>
              </div>
            ))}
          </div>
        </section>
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto w-full max-w-5xl px-4 py-4 sm:px-6">
          <p className="text-xs text-muted-foreground">
            Aibinu Flexiprep — controlled engineering project. Every change ships
            through an approved gate.
          </p>
        </div>
      </footer>
    </div>
  );
}
