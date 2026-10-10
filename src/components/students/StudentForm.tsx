import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FormErrors } from "./shared";
import { GENDER_LABEL, GENDERS, PERSON_STATUSES, STATUS_LABEL, validateStudent, type StudentInput } from "@/lib/students/permissions";

export const EMPTY_STUDENT: StudentInput = { admissionNo: "", fullName: "", dateOfBirth: "", gender: "undisclosed", phone: "", email: "", status: "active" };

export function StudentForm({ initial, submitLabel, pending, onSubmit, onCancel }: {
  initial: StudentInput;
  submitLabel: string;
  pending: boolean;
  onSubmit: (v: StudentInput) => void;
  onCancel?: () => void;
}) {
  const [v, setV] = useState<StudentInput>(initial);
  const [errors, setErrors] = useState<string[]>([]);
  const set = (k: keyof StudentInput) => (e: React.ChangeEvent<HTMLInputElement>) => setV({ ...v, [k]: e.target.value });

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        const errs = validateStudent(v);
        setErrors(errs);
        if (!errs.length) onSubmit(v);
      }}
    >
      <FormErrors errors={errors} />
      <div className="grid gap-3 sm:grid-cols-2">
        <div><Label htmlFor="fn">Full name *</Label><Input id="fn" value={v.fullName} onChange={set("fullName")} maxLength={150} required /></div>
        <div><Label htmlFor="an">Admission number</Label><Input id="an" value={v.admissionNo} onChange={set("admissionNo")} maxLength={40} placeholder="e.g. AF/2026/001" /></div>
        <div><Label htmlFor="dob">Date of birth</Label><Input id="dob" type="date" value={v.dateOfBirth} onChange={set("dateOfBirth")} /></div>
        <div>
          <Label>Gender</Label>
          <Select value={v.gender} onValueChange={(g) => setV({ ...v, gender: g as StudentInput["gender"] })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{GENDERS.map((g) => <SelectItem key={g} value={g}>{GENDER_LABEL[g]}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div><Label htmlFor="ph">Phone</Label><Input id="ph" value={v.phone} onChange={set("phone")} maxLength={20} /></div>
        <div><Label htmlFor="em">Email</Label><Input id="em" type="email" value={v.email} onChange={set("email")} maxLength={200} /></div>
        <div>
          <Label>Status</Label>
          <Select value={v.status} onValueChange={(s) => setV({ ...v, status: s as StudentInput["status"] })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{PERSON_STATUSES.map((s) => <SelectItem key={s} value={s}>{STATUS_LABEL[s]}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      </div>
      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>{pending ? "Saving…" : submitLabel}</Button>
        {onCancel && <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>}
      </div>
    </form>
  );
}
