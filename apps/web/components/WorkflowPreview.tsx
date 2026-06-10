import {
  Radio,
  Calculator,
  ListOrdered,
  FileText,
  UserCheck,
  Zap,
  Loader2,
  Database,
  Activity,
  Cpu,
  ShieldOff,
} from "lucide-react";
import type { MetaResponse } from "@/lib/types";

const STEPS = [
  {
    icon: Radio,
    title: "Ingest customer signals",
    desc: "Normalize and group fragmented signals by account.",
  },
  {
    icon: Calculator,
    title: "Score risk and opportunity",
    desc: "Transparent deterministic weighting before any model call.",
  },
  {
    icon: ListOrdered,
    title: "Rank priority accounts",
    desc: "Surface the accounts that need attention this week.",
  },
  {
    icon: FileText,
    title: "Generate evidence-backed action",
    desc: "Next-best action with evidence and seller-ready drafts.",
  },
  {
    icon: UserCheck,
    title: "Wait for human approval",
    desc: "No action executes without an explicit human decision.",
  },
];

export function WorkflowPreview({
  meta,
  onRun,
  loading,
}: {
  meta: MetaResponse | null;
  onRun: () => void;
  loading: boolean;
}) {
  const metrics = [
    { icon: Database, label: "Accounts loaded", value: meta ? meta.dataset.accounts : "—" },
    { icon: Activity, label: "Signals available", value: meta ? meta.dataset.signals : "—" },
    { icon: Cpu, label: "Agents configured", value: meta ? meta.agents.length : "—" },
    { icon: ShieldOff, label: "Autonomous actions blocked", value: "100%" },
  ];

  return (
    <div className="card-elevated animate-fade-in overflow-hidden">
      <div className="grid-dots border-b border-edge p-5">
        <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-accent">
          <span className="h-1.5 w-1.5 rounded-full bg-accent animate-pulseline" />
          Workflow preview
        </div>
        <h2 className="mt-2 text-lg font-semibold text-ink">Signal-to-Action Workflow Preview</h2>
        <p className="mt-1 max-w-xl text-sm leading-relaxed text-muted">
          A controlled multi-agent workflow that converts fragmented customer signals into
          explainable, human-approved next-best actions — with evidence, confidence, and governance
          at every step.
        </p>
        <button className="btn btn-primary mt-4 px-4 py-2.5 font-semibold" onClick={onRun} disabled={loading}>
          {loading ? <Loader2 size={15} className="animate-spin" /> : <Zap size={15} />}
          Run agent workflow
        </button>
      </div>

      <div className="p-5">
        <ol className="relative space-y-2">
          {STEPS.map((s, i) => (
            <li
              key={s.title}
              className="flex items-start gap-3 rounded-lg border border-edge bg-surface2/40 px-3 py-2.5"
            >
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-edge bg-surface text-accent">
                <s.icon size={15} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[10px] text-faint">0{i + 1}</span>
                  <span className="text-sm font-semibold text-ink">{s.title}</span>
                </div>
                <p className="mt-0.5 text-[11px] leading-relaxed text-muted">{s.desc}</p>
              </div>
            </li>
          ))}
        </ol>

        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {metrics.map((m) => (
            <div key={m.label} className="rounded-lg border border-edge bg-surface2/50 px-3 py-2.5">
              <m.icon size={14} className="text-cyan" />
              <div className="mt-1.5 font-mono text-lg font-semibold text-ink">{m.value}</div>
              <div className="text-[10px] uppercase tracking-wider text-faint">{m.label}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
