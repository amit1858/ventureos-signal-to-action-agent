import { Server, ArrowRight } from "lucide-react";
import { Card } from "./ui";

export function NvidiaReadyCard({ provider }: { provider: string }) {
  const rows: Array<{ label: string; value: string; tone: string }> = [
    { label: "Current provider", value: provider, tone: "text-cyan" },
    { label: "NVIDIA target", value: "NIM / Nemotron", tone: "text-accent" },
    { label: "Agent orchestration", value: "NeMo-ready contracts", tone: "text-muted" },
    { label: "Optimization focus", value: "Latency · structured outputs · eval", tone: "text-muted" },
    { label: "GPU-backed inference", value: "Planned", tone: "text-amber" },
  ];

  return (
    <Card className="animate-fade-in border-accent/30 p-4">
      <div className="flex items-center gap-2">
        <div className="flex h-7 w-7 items-center justify-center rounded-md border border-accent/40 bg-accent/10">
          <Server size={13} className="text-accent" />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-ink">NVIDIA-ready runtime</h3>
          <p className="text-[11px] text-muted">Replaceable model layer · inference-only MVP</p>
        </div>
      </div>

      <div className="mt-3 flex items-center gap-2 text-[11px]">
        <span className="rounded-md border border-edge bg-surface2 px-2 py-1 font-mono text-muted">
          mock_adapter
        </span>
        <ArrowRight size={13} className="text-faint" />
        <span className="rounded-md border border-accent/40 bg-accent/10 px-2 py-1 font-mono text-accent">
          nvidia_nim_adapter
        </span>
      </div>

      <dl className="mt-3 divide-y divide-edge/60 overflow-hidden rounded-lg border border-edge bg-surface2/40 text-[11px]">
        {rows.map((r) => (
          <div key={r.label} className="flex items-center justify-between gap-3 px-2.5 py-1.5">
            <dt className="text-faint">{r.label}</dt>
            <dd className={`shrink-0 text-right font-medium ${r.tone}`}>{r.value}</dd>
          </div>
        ))}
      </dl>

      <p className="mt-2.5 text-[10px] leading-relaxed text-faint">
        Swap the model layer with <span className="font-mono text-muted">MODEL_PROVIDER=nvidia</span>{" "}
        and <span className="font-mono text-muted">NVIDIA_API_KEY</span>. Nemotron / NIM endpoints
        power reasoning and summarization; NeMo Agent Toolkit can later formalize the orchestrator.
      </p>
    </Card>
  );
}
