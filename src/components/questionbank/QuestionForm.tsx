import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import type { QuestionVersionRow } from "@/lib/questionbank/api";
import {
  COGNITIVE_LEVELS,
  DIFFICULTIES,
  usesAnswerKey,
  usesOptions,
  type CognitiveLevel,
  type Difficulty,
  type DraftInput,
  type QuestionOption,
  type QuestionType,
} from "@/lib/questionbank/permissions";

export function emptyDraft(type: QuestionType): DraftInput {
  return {
    type,
    stem: "",
    options: defaultOptions(type),
    acceptedAnswers: [""],
    explanation: "",
    marks: 1,
    difficulty: "medium",
    cognitiveLevel: "apply",
  };
}

export function defaultOptions(type: QuestionType): QuestionOption[] {
  if (type === "true_false") return [{ key: "a", text: "True", is_correct: false }, { key: "b", text: "False", is_correct: false }];
  if (type === "mcq" || type === "multi_select") return ["a", "b", "c", "d"].map((k) => ({ key: k, text: "", is_correct: false }));
  return [];
}

export function draftFromVersion(type: QuestionType, v: QuestionVersionRow): DraftInput {
  const key = v.answer_key as { accepted?: string[] } | string[] | string | null;
  const accepted = Array.isArray(key) ? key : typeof key === "string" ? [key] : key?.accepted ?? [""];
  return {
    type,
    stem: v.stem,
    options: v.options ?? defaultOptions(type),
    acceptedAnswers: accepted.length ? accepted : [""],
    explanation: v.explanation ?? "",
    marks: Number(v.marks),
    difficulty: v.difficulty,
    cognitiveLevel: v.cognitive_level,
  };
}

export function QuestionFields({ value, onChange, disabled = false }: { value: DraftInput; onChange: (d: DraftInput) => void; disabled?: boolean | undefined }) {
  const set = (p: Partial<DraftInput>) => onChange({ ...value, ...p });
  const setOpt = (i: number, p: Partial<QuestionOption>) => set({ options: value.options.map((o, j) => (j === i ? { ...o, ...p } : o)) });
  const single = value.type === "mcq" || value.type === "true_false";
  const [answersText, setAnswersText] = useState(value.acceptedAnswers.join("\n"));

  return (
    <div className="space-y-4">
      <div>
        <Label htmlFor="q-stem">Question</Label>
        <Textarea id="q-stem" rows={4} value={value.stem} disabled={disabled} maxLength={5000} onChange={(e) => set({ stem: e.target.value })} />
      </div>

      {usesOptions(value.type) && (
        <fieldset className="space-y-2" disabled={disabled}>
          <legend className="text-sm font-medium">Options — {single ? "choose the one correct answer" : "tick every correct answer"}</legend>
          {single ? (
            <RadioGroup
              value={String(value.options.findIndex((o) => o.is_correct))}
              onValueChange={(v) => set({ options: value.options.map((o, j) => ({ ...o, is_correct: String(j) === v })) })}
              className="space-y-2"
            >
              {value.options.map((o, i) => (
                <div key={i} className="flex items-center gap-2">
                  <RadioGroupItem value={String(i)} id={`opt-${i}`} aria-label={`Mark option ${i + 1} correct`} disabled={disabled} />
                  <Input aria-label={`Option ${i + 1}`} value={o.text} disabled={disabled || value.type === "true_false"} onChange={(e) => setOpt(i, { text: e.target.value })} />
                  {value.type === "mcq" && value.options.length > 2 && !disabled && (
                    <Button type="button" variant="ghost" size="sm" onClick={() => set({ options: value.options.filter((_, j) => j !== i) })}>Remove</Button>
                  )}
                </div>
              ))}
            </RadioGroup>
          ) : (
            value.options.map((o, i) => (
              <div key={i} className="flex items-center gap-2">
                <Checkbox checked={o.is_correct} disabled={disabled} aria-label={`Option ${i + 1} is correct`} onCheckedChange={(c) => setOpt(i, { is_correct: c === true })} />
                <Input aria-label={`Option ${i + 1}`} value={o.text} disabled={disabled} onChange={(e) => setOpt(i, { text: e.target.value })} />
                {value.options.length > 2 && !disabled && (
                  <Button type="button" variant="ghost" size="sm" onClick={() => set({ options: value.options.filter((_, j) => j !== i) })}>Remove</Button>
                )}
              </div>
            ))
          )}
          {value.type !== "true_false" && value.options.length < 8 && !disabled && (
            <Button type="button" variant="outline" size="sm" onClick={() => set({ options: [...value.options, { key: "", text: "", is_correct: false }] })}>Add option</Button>
          )}
        </fieldset>
      )}

      {usesAnswerKey(value.type) && (
        <div>
          <Label htmlFor="q-answers">Accepted answers (one per line)</Label>
          <Textarea
            id="q-answers"
            rows={3}
            value={answersText}
            disabled={disabled}
            onChange={(e) => { setAnswersText(e.target.value); set({ acceptedAnswers: e.target.value.split("\n") }); }}
          />
          <p className="mt-1 text-xs text-muted-foreground">Marked automatically on the server, ignoring capital letters and extra spaces.</p>
        </div>
      )}

      {value.type === "theory" && (
        <p className="text-sm text-muted-foreground">Theory answers are marked by a teacher. Use the explanation for the model answer or marking guide.</p>
      )}

      <div>
        <Label htmlFor="q-expl">Explanation</Label>
        <Textarea id="q-expl" rows={3} value={value.explanation} disabled={disabled} onChange={(e) => set({ explanation: e.target.value })} />
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <Label htmlFor="q-marks">Marks</Label>
          <Input id="q-marks" type="number" min={0.5} step={0.5} value={value.marks} disabled={disabled} onChange={(e) => set({ marks: Number(e.target.value) })} />
        </div>
        <div>
          <Label>Difficulty</Label>
          <Select value={value.difficulty} disabled={disabled} onValueChange={(v) => set({ difficulty: v as Difficulty })}>
            <SelectTrigger aria-label="Difficulty"><SelectValue /></SelectTrigger>
            <SelectContent>{DIFFICULTIES.map((d) => <SelectItem key={d} value={d} className="capitalize">{d}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div>
          <Label>Thinking level</Label>
          <Select value={value.cognitiveLevel} disabled={disabled} onValueChange={(v) => set({ cognitiveLevel: v as CognitiveLevel })}>
            <SelectTrigger aria-label="Thinking level"><SelectValue /></SelectTrigger>
            <SelectContent>{COGNITIVE_LEVELS.map((c) => <SelectItem key={c} value={c} className="capitalize">{c}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      </div>
    </div>
  );
}
