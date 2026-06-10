import {
  Building2,
  AlertTriangle,
  FileSearch,
  GitBranch,
  Gauge,
  ShieldCheck,
  Mail,
  Lock,
} from "lucide-react";
import { Card } from "./ui";

const ROWS = [
  { icon: Building2, label: "Account context", desc: "Industry, segment, spend, usage, renewal." },
  { icon: AlertTriangle, label: "Risk & opportunity summary", desc: "Why this account surfaced now." },
  { icon: FileSearch, label: "Evidence used", desc: "Source-tagged signals behind the call." },
  { icon: GitBranch, label: "Agent trace", desc: "Each agent's contribution and status." },
  { icon: Gauge, label: "Confidence score", desc: "Evidence-weighted reliability of the action." },
  { icon: ShieldCheck, label: "Governance checks", desc: "Human approval required; no autonomy." },
  { icon: Mail, label: "Draft seller action", desc: "Ready-to-send email and call script." },
];

export function DecisionWorkspacePreview() {
  return (
    <Card className="animate-fade-in p-4">
      <div className="flex items-center gap-2">
        <div className="flex h-7 w-7 items-center justify-center rounded-md border border-edge bg-surface2">
          <Lock size={13} className="text-faint" />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-ink">Decision Workspace Preview</h3>
          <p className="text-[11px] text-muted">Select an account to open its full decision record.</p>
        </div>
      </div>

      <ul className="mt-3 space-y-1.5">
        {ROWS.map((r, i) => (
          <li
            key={r.label}
            className="flex items-start gap-2.5 rounded-lg border border-edge bg-surface2/30 px-2.5 py-2"
          >
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-edge bg-surface text-cyan">
              <r.icon size={13} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span className="font-mono text-[9px] text-faint">0{i + 1}</span>
                <span className="text-[12px] font-semibold text-ink">{r.label}</span>
              </div>
              <p className="text-[10px] leading-snug text-muted">{r.desc}</p>
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}
