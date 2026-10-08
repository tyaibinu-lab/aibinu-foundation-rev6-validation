import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  ATTEMPT_POLICIES, EXAM_KINDS, RELEASE_POLICIES, listSessions, listSubjects, validateExamDraft,
  type AttemptPolicy, type ExamDraftInput, type ExamKind, type ExamRow, type ReleasePolicy,
} from "@/lib/cbt/api";

const NONE = "none";
const toLocal = (iso: string) => { const d = new Date(iso); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 16); };
const fromLocal = (v: string) => (v ? new Date(v).toISOString() : "");

export function examToInput(x: ExamRow): ExamDraftInput {
  return {
    title: x.title, kind: x.kind, subjectId: x.subject_id, academicSessionId: x.academic_session_id, instructions: x.instructions ?? "",
    opensAt: x.opens_at, closesAt: x.closes_at, durationMin: x.duration_min, hardClose: x.hard_close, attemptsAllowed: x.attempts_allowed,
    attemptPolicy: x.attempt_policy, shuffleQuestions: x.shuffle_questions, shuffleOptions: x.shuffle_options, passMarkPct: Number(x.pass_mark_pct),
    releasePolicy: x.release_policy, allowReview: x.allow_review, requiresFeesCleared: x.requires_fees_cleared,
  };
}

export function defaultExamInput(): ExamDraftInput {
  const now = new Date();
  return {
    title: "", kind: "test", subjectId: null, academicSessionId: null, instructions: "",
    opensAt: new Date(now.getTime() + 60 * 60_000).toISOString(), closesAt: new Date(now.getTime() + 7 * 86_400_000).toISOString(),
    durationMin: 30, hardClose: true, attemptsAllowed: 1, attemptPolicy: "best", shuffleQuestions: false, shuffleOptions: false,
    passMarkPct: 50, releasePolicy: "manual", allowReview: false, requiresFeesCleared: false,
  };
}

export function ExamForm({ initial, submitLabel, pending, disabled: disabledProp, onSubmit }: { initial: ExamDraftInput; submitLabel: string; pending: boolean; disabled?: boolean; onSubmit: (v: ExamDraftInput) => void }) {
  const disabled = disabledProp === true;
  const [v, setV] = useState<ExamDraftInput>(initial);
  const [errors, setErrors] = useState<string[]>([]);
  const subjects = useQuery({ queryKey: ["cbt", "subjects"], queryFn: listSubjects, retry: false });
  const sessions = useQuery({ queryKey: ["cbt", "sessions"], queryFn: listSessions, retry: false });
  const set = <K extends keyof ExamDraftInput>(k: K, val: ExamDraftInput[K]) => setV((p) => ({ ...p, [k]: val }));
  const flag = (k: "hardClose" | "shuffleQuestions" | "shuffleOptions" | "allowReview" | "requiresFeesCleared", label: string) => (
    <label className="flex items-center gap-2 text-sm"><Checkbox checked={v[k]} disabled={disabled} onCheckedChange={(c) => set(k, c === true)} />{label}</label>
  );

  return (
    <form
      className="space-y-6"
      onSubmit={(e) => { e.preventDefault(); const errs = validateExamDraft(v); setErrors(errs); if (!errs.length) onSubmit(v); }}
    >
      <Card>
        <CardHeader><CardTitle>Exam details</CardTitle></CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2"><Label htmlFor="title">Title</Label><Input id="title" value={v.title} disabled={disabled} onChange={(e) => set("title", e.target.value)} /></div>
          <div><Label>Exam type</Label>
            <Select value={v.kind} disabled={disabled} onValueChange={(k) => set("kind", k as ExamKind)}>
              <SelectTrigger aria-label="Exam type"><SelectValue /></SelectTrigger>
              <SelectContent>{EXAM_KINDS.map((k) => <SelectItem key={k} value={k}>{k}</SelectItem>)}</SelectContent>
            </Select></div>
          <div><Label>Subject</Label>
            <Select value={v.subjectId ?? NONE} disabled={disabled} onValueChange={(s) => set("subjectId", s === NONE ? null : s)}>
              <SelectTrigger aria-label="Subject"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value={NONE}>None</SelectItem>{(subjects.data ?? []).map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
            </Select></div>
          <div className="sm:col-span-2"><Label>Academic session / term</Label>
            <Select value={v.academicSessionId ?? NONE} disabled={disabled} onValueChange={(s) => set("academicSessionId", s === NONE ? null : s)}>
              <SelectTrigger aria-label="Academic session"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value={NONE}>None</SelectItem>{(sessions.data ?? []).map((s) => <SelectItem key={s.id} value={s.id}>{s.name}{s.term ? ` · ${s.term} term` : ""}{s.is_current ? " (current)" : ""}</SelectItem>)}</SelectContent>
            </Select></div>
          <div className="sm:col-span-2"><Label htmlFor="instr">Instructions</Label><Textarea id="instr" value={v.instructions} disabled={disabled} onChange={(e) => set("instructions", e.target.value)} /></div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Schedule and rules</CardTitle></CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div><Label htmlFor="opens">Opens</Label><Input id="opens" type="datetime-local" value={v.opensAt ? toLocal(v.opensAt) : ""} disabled={disabled} onChange={(e) => set("opensAt", fromLocal(e.target.value))} /></div>
          <div><Label htmlFor="closes">Closes</Label><Input id="closes" type="datetime-local" value={v.closesAt ? toLocal(v.closesAt) : ""} disabled={disabled} onChange={(e) => set("closesAt", fromLocal(e.target.value))} /></div>
          <div><Label htmlFor="dur">Duration (minutes)</Label><Input id="dur" type="number" min={1} value={v.durationMin} disabled={disabled} onChange={(e) => set("durationMin", Number(e.target.value))} /></div>
          <div><Label htmlFor="att">Attempts allowed</Label><Input id="att" type="number" min={1} value={v.attemptsAllowed} disabled={disabled} onChange={(e) => set("attemptsAllowed", Number(e.target.value))} /></div>
          <div><Label>Attempt that counts</Label>
            <Select value={v.attemptPolicy} disabled={disabled} onValueChange={(p) => set("attemptPolicy", p as AttemptPolicy)}>
              <SelectTrigger aria-label="Attempt policy"><SelectValue /></SelectTrigger>
              <SelectContent>{ATTEMPT_POLICIES.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
            </Select></div>
          <div><Label htmlFor="pass">Pass mark (%)</Label><Input id="pass" type="number" min={0} max={100} value={v.passMarkPct} disabled={disabled} onChange={(e) => set("passMarkPct", Number(e.target.value))} /></div>
          <div><Label>Result release</Label>
            <Select value={v.releasePolicy} disabled={disabled} onValueChange={(p) => set("releasePolicy", p as ReleasePolicy)}>
              <SelectTrigger aria-label="Release policy"><SelectValue /></SelectTrigger>
              <SelectContent>{RELEASE_POLICIES.map((p) => <SelectItem key={p} value={p}>{p.replace("_", " ")}</SelectItem>)}</SelectContent>
            </Select></div>
          <div className="space-y-2 sm:col-span-2">
            {flag("hardClose", "Hard close (no attempts after closing time)")}
            {flag("shuffleQuestions", "Shuffle questions")}
            {flag("shuffleOptions", "Shuffle options")}
            {flag("allowReview", "Allow students to review answers after release")}
            {flag("requiresFeesCleared", "Require fees cleared")}
          </div>
        </CardContent>
      </Card>
      {errors.length > 0 && <ul className="list-disc pl-5 text-sm text-destructive">{errors.map((e) => <li key={e}>{e}</li>)}</ul>}
      {!disabled && <Button type="submit" disabled={pending}>{pending ? "Saving…" : submitLabel}</Button>}
    </form>
  );
}
