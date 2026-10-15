import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { AccountBar } from "@/components/auth/TenantGate";
import { defaultVersion, getVersionTree, listCurricula, listVersions, type VersionRow } from "@/lib/curriculum/api";

export const Route = createFileRoute("/curriculum/")({
  head: () => ({
    meta: [
      { title: "Curriculum Bank — Aibinu Flexiprep" },
      { name: "description", content: "Browse your organisation's curricula, versions, units and topics." },
      { property: "og:title", content: "Curriculum Bank — Aibinu Flexiprep" },
      { property: "og:description", content: "Browse your organisation's curricula, versions, units and topics." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CurriculumBank,
});

function describe(err: unknown) {
  return err && typeof err === "object" && "message" in err ? String((err as { message: unknown }).message) : String(err);
}

function ErrorBox({ error }: { error: unknown }) {
  return (
    <Alert variant="destructive">
      <AlertTitle>Could not load</AlertTitle>
      <AlertDescription>{describe(error)}</AlertDescription>
    </Alert>
  );
}

function VersionBadge({ status }: { status: VersionRow["status"] }) {
  return <Badge variant={status === "published" ? "default" : "outline"}>{status}</Badge>;
}

function CurriculumBank() {
  const [curriculumId, setCurriculumId] = useState<string | null>(null);
  const [versionId, setVersionId] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  const curricula = useQuery({ queryKey: ["curriculum", "list"], queryFn: listCurricula, retry: false });
  const versions = useQuery({ queryKey: ["curriculum", "versions", curriculumId], queryFn: () => listVersions(curriculumId!), retry: false, enabled: !!curriculumId });
  // Versions only come from the current curriculum's query, so a stale id can never resolve.
  const versionList = curriculumId ? versions.data ?? [] : [];
  const visible = visibleVersions(versionList, showAll);
  const selectedId = selectVersion(versionList, showAll, versionId)?.id ?? null;
  const tree = useQuery({ queryKey: ["curriculum", "tree", selectedId], queryFn: () => getVersionTree(selectedId!), retry: false, enabled: !!selectedId });

  const chooseCurriculum = (id: string) => { setCurriculumId(id); setVersionId(null); };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b-4 border-accent bg-primary text-primary-foreground">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-4">
          <Link to="/" className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-md bg-accent text-sm font-bold text-accent-foreground">AF</span>
            <span className="font-semibold">Aibinu Flexiprep · Curriculum Bank</span>
          </Link>
          <AccountBar />
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8">
        <h1 className="text-2xl font-bold text-foreground">Curriculum Bank</h1>
        <p className="mt-1 text-sm text-muted-foreground">Read-only view of curricula in your current organisation. Access is enforced by the database.</p>

        <div className="mt-6 grid gap-6 md:grid-cols-[18rem_1fr]">
          <Card>
            <CardHeader><CardTitle>Curricula</CardTitle></CardHeader>
            <CardContent>
              {curricula.error ? <ErrorBox error={curricula.error} /> : curricula.isLoading ? <p className="text-sm text-muted-foreground">Loading…</p> : (curricula.data ?? []).length === 0 ? (
                <p className="text-sm text-muted-foreground">No curricula in this organisation yet.</p>
              ) : (
                <ul className="space-y-1">
                  {curricula.data!.map((c) => (
                    <li key={c.id}>
                      <button type="button" onClick={() => setCurriculumId(c.id)} aria-pressed={curriculumId === c.id}
                        className={`w-full rounded-md px-2 py-2 text-left text-sm hover:bg-muted ${curriculumId === c.id ? "bg-muted font-semibold" : ""}`}>
                        {c.name}
                        <span className="block text-xs text-muted-foreground">{[c.exam_body, c.subjects?.name, c.level].filter(Boolean).join(" · ")}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
              <CardTitle>Versions and topics</CardTitle>
              <div className="flex items-center gap-2">
                <Switch id="all" checked={showAll} onCheckedChange={setShowAll} />
                <Label htmlFor="all" className="text-sm">Show draft and archived</Label>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {!curriculumId ? <p className="text-sm text-muted-foreground">Choose a curriculum.</p>
                : versions.error ? <ErrorBox error={versions.error} />
                : versions.isLoading ? <p className="text-sm text-muted-foreground">Loading versions…</p>
                : visibleVersions.length === 0 ? <p className="text-sm text-muted-foreground">{showAll ? "This curriculum has no versions." : "No published version. Turn on “Show draft and archived” to browse others."}</p>
                : (
                  <>
                    <div className="flex flex-wrap gap-2">
                      {visibleVersions.map((v) => (
                        <button key={v.id} type="button" onClick={() => setVersionId(v.id)} aria-pressed={versionId === v.id}
                          className={`flex items-center gap-2 rounded-md border px-3 py-1 text-sm ${versionId === v.id ? "border-primary" : "border-border"}`}>
                          {v.version_label} <VersionBadge status={v.status} />
                        </button>
                      ))}
                    </div>
                    {!versionId ? <p className="text-sm text-muted-foreground">Choose a version.</p>
                      : tree.error ? <ErrorBox error={tree.error} />
                      : tree.isLoading ? <p className="text-sm text-muted-foreground">Loading topics…</p>
                      : tree.data!.units.length === 0 ? <p className="text-sm text-muted-foreground">This version has no units yet.</p>
                      : (
                        <ol className="space-y-3">
                          {tree.data!.units.map((u) => (
                            <li key={u.id}>
                              <details open className="rounded-md border border-border p-3">
                                <summary className="cursor-pointer font-medium">{u.title} <span className="text-xs text-muted-foreground">({u.topics.length} topics)</span></summary>
                                {u.topics.length === 0 ? <p className="mt-2 text-sm text-muted-foreground">No topics.</p> : (
                                  <ul className="mt-2 divide-y divide-border">
                                    {u.topics.map((t) => (
                                      <li key={t.id} className="flex flex-wrap justify-between gap-2 py-2 text-sm">
                                        <span><span className="font-mono text-xs text-muted-foreground">{t.code}</span> {t.title}</span>
                                        <span className="text-xs text-muted-foreground">{[t.class_level, t.term !== "any" ? `${t.term} term` : null].filter(Boolean).join(" · ")}</span>
                                      </li>
                                    ))}
                                  </ul>
                                )}
                              </details>
                            </li>
                          ))}
                        </ol>
                      )}
                  </>
                )}
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
