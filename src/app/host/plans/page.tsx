"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { HostGate } from "@/components/HostGate";
import { api, post } from "@/components/fetcher";
import { Alert, Badge, Button, Card, EmptyState, Field, Spinner, inputCls } from "@/components/ui";

interface PlanRow {
  id: string;
  title: string;
  subject: string;
  courseLabel: string;
  unitLabel: string;
  status: "draft" | "published";
  publishedVersion: number | null;
  draftVersion: number | null;
  source: string;
  isDemoData: boolean;
  assignedCount: number;
  updatedAt: string;
}

const MAX_BYTES = 100_000;

export default function PlansPage() {
  return <HostGate>{() => <Plans />}</HostGate>;
}

function Plans() {
  const router = useRouter();
  const [plans, setPlans] = useState<PlanRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<"none" | "create" | "import">("none");
  const [meta, setMeta] = useState({ title: "", subject: "math", courseLabel: "", description: "", unitLabel: "Lecture" });
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [importNote, setImportNote] = useState<string | null>(null);

  useEffect(() => {
    api<{ plans: PlanRow[] }>("/api/host/plans").then((r) => setPlans(r.plans)).catch((e) => setError((e as Error).message));
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (mode === "create") {
        const r = await post<{ plan: { id: string } }>("/api/host/plans", meta);
        router.push(`/host/plans/${r.plan.id}`);
      } else {
        if (!file) throw new Error("Choose a .txt or .md file.");
        if (!/\.(txt|md|markdown)$/i.test(file.name)) throw new Error("Import supports .txt and .md files for now. PDF import isn't available yet.");
        if (file.size > MAX_BYTES) throw new Error("That file is larger than 100 KB.");
        const text = await file.text();
        const r = await post<{ planId: string; extraction: string; warnings: string[]; errorCode: string | null }>("/api/host/plans/import", { filename: file.name, text, meta });
        setImportNote(`Imported as a draft (${r.extraction === "ai" ? "AI-extracted" : "rule-based"}). Review it before publishing.`);
        router.push(`/host/plans/${r.planId}?imported=${encodeURIComponent(JSON.stringify({ extraction: r.extraction, warnings: r.warnings, errorCode: r.errorCode }))}`);
      }
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link href="/host" className="text-sm underline">
            ← Host dashboard
          </Link>
          <h1 className="text-3xl font-bold">Learning plans</h1>
          <p className="text-navy-soft">Organise objectives by lecture or lesson, link them to verified questions, and assign plans to your classrooms.</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => setMode(mode === "create" ? "none" : "create")} aria-expanded={mode === "create"}>
            + New plan
          </Button>
          <Button variant="secondary" onClick={() => setMode(mode === "import" ? "none" : "import")} aria-expanded={mode === "import"}>
            Import .txt / .md
          </Button>
        </div>
      </div>

      {error && <Alert tone="rose" role="alert">{error}</Alert>}
      {importNote && <Alert tone="green" role="status">{importNote}</Alert>}

      {mode !== "none" && (
        <Card>
          <form className="space-y-4" onSubmit={submit}>
            <h2 className="text-xl font-bold">{mode === "create" ? "New learning plan" : "Import a plan"}</h2>
            {mode === "import" && (
              <Alert tone="violet">
                Upload a .txt or .md file (max 100 KB) with headings like “Lecture 5: Comparing fractions” and bullet-point objectives. Rematch extracts a <strong>draft</strong>;
                nothing is published until you review it. Vague or broad objectives are flagged for you to resolve.
              </Alert>
            )}
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Title" htmlFor="pt">
                <input id="pt" className={inputCls} value={meta.title} onChange={(e) => setMeta({ ...meta, title: e.target.value })} required maxLength={100} />
              </Field>
              <Field label="Grade or course" htmlFor="pc" hint="e.g. Grade 5 · Room 5B, or MATH 101">
                <input id="pc" className={inputCls} value={meta.courseLabel} onChange={(e) => setMeta({ ...meta, courseLabel: e.target.value })} maxLength={80} />
              </Field>
              <Field label="Subject" htmlFor="ps">
                <select id="ps" className={inputCls} value={meta.subject} onChange={(e) => setMeta({ ...meta, subject: e.target.value })}>
                  <option value="reading">Reading comprehension</option>
                  <option value="math">Math</option>
                  <option value="mixed">Both (mixed)</option>
                </select>
              </Field>
              <Field label="Units are called" htmlFor="pu" hint="Use Lecture for courses, Lesson for classrooms.">
                <select id="pu" className={inputCls} value={meta.unitLabel} onChange={(e) => setMeta({ ...meta, unitLabel: e.target.value })}>
                  <option>Lecture</option>
                  <option>Lesson</option>
                </select>
              </Field>
            </div>
            <Field label="Description" htmlFor="pd">
              <textarea id="pd" className={inputCls} value={meta.description} onChange={(e) => setMeta({ ...meta, description: e.target.value })} maxLength={800} />
            </Field>
            {mode === "import" && (
              <Field label="Plan file" htmlFor="pf" hint=".txt or .md, up to 100 KB">
                <input id="pf" type="file" accept=".txt,.md,.markdown,text/plain,text/markdown" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="block text-sm" />
              </Field>
            )}
            <Button type="submit" disabled={busy || !meta.title.trim() || (mode === "import" && !file)}>
              {busy ? (mode === "import" ? "Extracting draft…" : "Creating…") : mode === "import" ? "Import as draft" : "Create plan"}
            </Button>
          </form>
        </Card>
      )}

      <Card>
        <h2 className="text-xl font-bold mb-3">Your plans</h2>
        {!plans ? (
          <Spinner label="Loading plans" />
        ) : plans.length === 0 ? (
          <EmptyState title="No learning plans yet">Create one, or import a lesson plan file.</EmptyState>
        ) : (
          <ul className="divide-y divide-line">
            {plans.map((p) => (
              <li key={p.id} className="py-4 flex flex-wrap items-center justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex flex-wrap gap-2">
                    {p.status === "published" ? <Badge tone="green">Published v{p.publishedVersion}</Badge> : <Badge tone="amber">Draft</Badge>}
                    {p.status === "published" && p.draftVersion && <Badge tone="violet">Revision in progress</Badge>}
                    {p.source === "import" && <Badge tone="navy">Imported</Badge>}
                    {p.isDemoData && <Badge tone="amber">Demonstration data</Badge>}
                  </div>
                  <p className="font-semibold">{p.title}</p>
                  <p className="text-sm text-navy-soft">
                    {p.courseLabel || "No course label"} · {p.unitLabel}s · assigned to {p.assignedCount} classroom{p.assignedCount === 1 ? "" : "s"}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Link className="font-semibold text-violet-strong underline" href={`/host/plans/${p.id}`}>
                    Open
                  </Link>
                  {p.status === "published" && (
                    <Link className="font-semibold text-violet-strong underline" href={`/host/plans/${p.id}/progress`}>
                      Class progress
                    </Link>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
