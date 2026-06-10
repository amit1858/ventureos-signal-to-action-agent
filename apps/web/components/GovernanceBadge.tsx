import { ShieldCheck, ShieldAlert, ShieldQuestion, Check, UserCheck, Ban, FlaskConical } from "lucide-react";
import { governanceTone, cx } from "@/lib/format";
import { Pill } from "./ui";

export function GovernanceBadge({ status }: { status: string }) {
  const tone = governanceTone(status);
  const Icon =
    status === "ok" ? ShieldCheck : status === "insufficient_evidence" ? ShieldAlert : ShieldQuestion;
  return (
    <Pill className={tone.cls} title={`Governance status: ${status}`}>
      <Icon size={13} />
      {tone.label}
    </Pill>
  );
}

// Reassurance grid making the governance posture explicit in the decision workspace.
export function GovernanceAssurance({ status }: { status: string }) {
  const evidenceOk = status === "ok";
  const items = [
    {
      ok: evidenceOk,
      label: evidenceOk ? "Evidence sufficient" : "Evidence under review",
      Icon: evidenceOk ? Check : ShieldQuestion,
    },
    { ok: true, label: "Human approval required", Icon: UserCheck },
    { ok: true, label: "No autonomous execution", Icon: Ban },
    { ok: true, label: "Synthetic data only", Icon: FlaskConical },
  ];
  return (
    <div className="grid grid-cols-2 gap-1.5">
      {items.map((it) => (
        <div
          key={it.label}
          className={cx(
            "flex items-center gap-1.5 rounded-md border px-2 py-1.5 text-[10px] font-medium",
            it.ok ? "border-accent/25 bg-accent/5 text-muted" : "border-amber/30 bg-amber/5 text-amber",
          )}
        >
          <it.Icon size={12} className={it.ok ? "text-accent" : "text-amber"} />
          {it.label}
        </div>
      ))}
    </div>
  );
}
