"use client";

// Guardrails Lab (Feature Branch) — isolated Curefoods governed-safety demo
// ========================================================================
// A READ-ONLY demonstration of "what the AI cannot do and how VentureOS proves
// it". Deterministic policy is authoritative; NVIDIA NemoGuard JailbreakDetect is
// additional, non-authoritative telemetry. No Production traffic is intercepted,
// no mission state changes, no audit reference changes, no action is executed.

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ShieldCheck,
  ShieldAlert,
  ShieldX,
  EyeOff,
  Cpu,
  ScrollText,
  FlaskConical,
  Activity,
  AlertTriangle,
  CheckCircle2,
} from "lucide-react";
import Link from "next/link";

import { evaluateRails, deriveDeterministicDecision } from "@/lib/guardrails/rails";
import { GUARDRAIL_SCENARIOS, CUREFOODS_AUDIT_REF, CUREFOODS_MISSION_ID } from "@/lib/guardrails/scenarios";
import type {
  GuardrailAuditProjection,
  GuardrailDecision,
  GuardrailEvaluation,
  GuardrailFinding,
  NvidiaGuardrailsMode,
} from "@/lib/guardrails/types";

type Mode = Extract<NvidiaGuardrailsMode, "live" | "forced_fallback">;

interface ClassifyResponse {
  evaluation: GuardrailEvaluation;
  audit: GuardrailAuditProjection;
}

const DECISION_STYLE: Record<GuardrailDecision, { label: string; cls: string; Icon: typeof ShieldCheck }> = {
  allowed: { label: "Allowed", cls: "text-accent-bright border-accent/40 bg-accent/10", Icon: ShieldCheck },
  blocked: { label: "Blocked", cls: "text-risk border-risk/40 bg-risk/10", Icon: ShieldX },
  redacted: { label: "Redacted", cls: "text-brand-bright border-brand/40 bg-brand/10", Icon: EyeOff },
  constrained: { label: "Constrained", cls: "text-brand-bright border-brand/40 bg-brand/10", Icon: ShieldAlert },
  escalated: { label: "Escalated", cls: "text-gov-bright border-gov/40 bg-gov/10", Icon: ShieldAlert },
};

function Chip({ children, tone = "edge" }: { children: React.ReactNode; tone?: "edge" | "accent" | "risk" | "gov" | "brand" }) {
  const tones: Record<string, string> = {
    edge: "border-edge bg-surface2 text-faint",
    accent: "border-accent/40 bg-accent/10 text-accent-bright",
    risk: "border-risk/40 bg-risk/10 text-risk",
    gov: "border-gov/40 bg-gov/10 text-gov-bright",
    brand: "border-brand/40 bg-brand/10 text-brand-bright",
  };
  return (
    <span className={`inline-flex items-center gap-1 rounded border px-1.5 py-[1px] text-[10px] font-medium uppercase tracking-wider ${tones[tone]}`}>
      {children}
    </span>
  );
}

function Panel({ title, icon, children, accent }: { title: string; icon: React.ReactNode; children: React.ReactNode; accent?: string }) {
  return (
    <section className={`rounded-xl border border-edge bg-surface p-4 shadow-panel ${accent ?? ""}`}>
      <div className="mb-3 flex items-center gap-2">
        <span className="text-brand-bright">{icon}</span>
        <h3 className="text-[13px] font-semibold tracking-tight text-ink">{title}</h3>
      </div>
      {children}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Feature-branch status + briefing (static, honest labels)
// ---------------------------------------------------------------------------

function FeatureBranchStatus() {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-gov/30 bg-gov/5 px-4 py-3">
      <Chip tone="gov"><FlaskConical size={11} /> Feature Branch</Chip>
      <Chip tone="brand">Guardrails Lab</Chip>
      <Chip tone="edge">Deterministic policy authoritative</Chip>
      <Chip tone="edge">NVIDIA NemoGuard classification</Chip>
      <Chip tone="edge">No Production traffic intercepted</Chip>
      <Chip tone="edge">No mission state changed</Chip>
      <Chip tone="edge">No audit reference changed</Chip>
      <Chip tone="edge">No action executed</Chip>
    </div>
  );
}

function GuardrailBriefing() {
  return (
    <Panel title="Guardrail briefing" icon={<ShieldCheck size={16} />}>
      <p className="text-[13px] leading-relaxed text-muted">
        This lab demonstrates <span className="text-ink">what the agent cannot do</span> on the governed Curefoods
        renewal mission (<span className="font-mono text-faint">{CUREFOODS_MISSION_ID}</span>). Every request is
        evaluated by <span className="text-accent-bright">VentureOS deterministic policy</span>, which is the final
        authority. <span className="text-brand-bright">NVIDIA NemoGuard JailbreakDetect</span> adds an independent
        classification signal — it never selects, approves, executes, or overrides the decision.
      </p>
    </Panel>
  );
}

// ---------------------------------------------------------------------------
// Deterministic rail results
// ---------------------------------------------------------------------------

function DeterministicRailResults({ findings }: { findings: readonly GuardrailFinding[] }) {
  const triggered = findings.filter((f) => f.triggered);
  const clear = findings.filter((f) => !f.triggered);
  return (
    <Panel title="Deterministic rail results" icon={<ShieldCheck size={16} />} accent="border-accent/20">
      <p className="mb-2 text-[11px] uppercase tracking-wider text-faint">Authoritative · reproducible from policy alone</p>
      <div className="space-y-1.5">
        {triggered.map((f) => (
          <div key={f.railId} className="flex items-start gap-2 rounded-lg border border-risk/30 bg-risk/5 px-3 py-2">
            <ShieldX size={14} className="mt-0.5 shrink-0 text-risk" />
            <div>
              <div className="text-[12px] font-medium text-ink">{f.railLabel}</div>
              <div className="text-[11px] text-muted">{f.detail}</div>
            </div>
          </div>
        ))}
        {triggered.length === 0 && (
          <div className="flex items-center gap-2 rounded-lg border border-accent/30 bg-accent/5 px-3 py-2">
            <CheckCircle2 size={14} className="text-accent-bright" />
            <span className="text-[12px] text-muted">No deterministic policy violation detected.</span>
          </div>
        )}
      </div>
      <details className="mt-2">
        <summary className="cursor-pointer text-[11px] text-faint hover:text-muted">
          {clear.length} rails evaluated and clear
        </summary>
        <div className="mt-1.5 flex flex-wrap gap-1">
          {clear.map((f) => (
            <Chip key={f.railId} tone="edge">{f.railLabel}</Chip>
          ))}
        </div>
      </details>
    </Panel>
  );
}

// ---------------------------------------------------------------------------
// NVIDIA classification (honest, non-authoritative)
// ---------------------------------------------------------------------------

function NvidiaClassification({ evaluation, loading }: { evaluation: GuardrailEvaluation | null; loading: boolean }) {
  const nvidia = evaluation?.nvidia;
  return (
    <Panel title="NVIDIA NemoGuard classification" icon={<Cpu size={16} />} accent="border-brand/20">
      <p className="mb-2 text-[11px] uppercase tracking-wider text-faint">Additional telemetry · not authoritative</p>
      {loading && <div className="text-[12px] text-muted">Classifying…</div>}
      {!loading && nvidia && (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            {nvidia.available ? (
              <Chip tone="accent"><Activity size={11} /> Live classification</Chip>
            ) : (
              <Chip tone="brand"><AlertTriangle size={11} /> Classification unavailable</Chip>
            )}
            <Chip tone="edge">mode: {nvidia.mode}</Chip>
            <Chip tone="edge">fallbackUsed: {String(nvidia.fallbackUsed)}</Chip>
            {nvidia.latencyMs !== null && <Chip tone="edge">{nvidia.latencyMs} ms</Chip>}
          </div>
          {nvidia.available ? (
            <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-[12px]">
              <dt className="text-faint">Boolean result</dt>
              <dd className="font-mono text-ink">{String(nvidia.booleanResult)}</dd>
              <dt className="text-faint">Raw jailbreak score</dt>
              <dd className="font-mono text-ink">{nvidia.rawScore}</dd>
            </dl>
          ) : (
            <p className="text-[12px] text-muted">
              NVIDIA classification unavailable — deterministic policy applied
              {nvidia.errorCode ? ` (${nvidia.errorCode})` : ""}.
            </p>
          )}
          <div className="rounded-lg border border-edge bg-surface2 px-3 py-2">
            <div className="text-[10px] uppercase tracking-wider text-faint">VentureOS demo interpretation</div>
            <div className="text-[12px] text-muted">{nvidia.interpretationLabel}</div>
            <div className="mt-1 text-[10px] text-faint">
              Raw score is a model decision value, not a probability or confidence. Final authority: VentureOS deterministic policy.
            </div>
          </div>
        </div>
      )}
    </Panel>
  );
}

// ---------------------------------------------------------------------------
// Final decision + safe response + action boundary
// ---------------------------------------------------------------------------

function FinalDecision({ decision, requiresHumanReview }: { decision: GuardrailDecision; requiresHumanReview: boolean }) {
  const s = DECISION_STYLE[decision];
  const { Icon } = s;
  return (
    <div className={`flex items-center justify-between rounded-xl border px-4 py-3 ${s.cls}`}>
      <div className="flex items-center gap-2">
        <Icon size={20} />
        <div>
          <div className="text-[11px] uppercase tracking-wider opacity-80">Final guardrail decision</div>
          <div className="text-[16px] font-semibold">{s.label}</div>
        </div>
      </div>
      <div className="text-right text-[10px] uppercase tracking-wider opacity-80">
        <div>Deterministic authority</div>
        {requiresHumanReview && <div className="text-gov-bright">Requires human review</div>}
      </div>
    </div>
  );
}

function ActionBoundary() {
  const items = [
    "No action executed",
    "Email not sent",
    "CRM task not created",
    "Risk update not written",
    "Mission state unchanged",
  ];
  return (
    <Panel title="Action boundary" icon={<ShieldAlert size={16} />}>
      <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
        {items.map((t) => (
          <div key={t} className="flex items-center gap-2 text-[12px] text-muted">
            <CheckCircle2 size={13} className="text-accent-bright" /> {t}
          </div>
        ))}
      </div>
    </Panel>
  );
}

function AuditProjection({ audit }: { audit: GuardrailAuditProjection | null }) {
  if (!audit) return null;
  const rows: Array<[string, string]> = [
    ["Scenario", audit.scenarioTitle],
    ["Rails evaluated", String(audit.railsEvaluated.length)],
    ["Findings triggered", String(audit.findings.filter((f) => f.triggered).length)],
    ["Deterministic final decision", audit.deterministicFinalDecision],
    ["NVIDIA available", String(audit.nvidiaAvailable)],
    ["NVIDIA boolean result", String(audit.nvidiaBooleanResult)],
    ["NVIDIA raw score", String(audit.nvidiaRawScore)],
    ["Fallback used", String(audit.fallbackUsed)],
    ["Referenced audit ref (read-only)", audit.referencedAuditRef],
    ["missionUnchanged", String(audit.missionUnchanged)],
    ["auditRefUnchanged", String(audit.auditRefUnchanged)],
    ["ledgerMutated", String(audit.ledgerMutated)],
    ["actionExecuted", String(audit.actionExecuted)],
  ];
  return (
    <Panel title="Read-only guardrail audit projection" icon={<ScrollText size={16} />} accent="border-gov/20">
      <p className="mb-2 text-[11px] text-faint">
        This is a guardrail evaluation record — <span className="text-gov-bright">not a ledger event</span>. It references
        the canonical Curefoods audit ref read-only and appends nothing.
      </p>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-[12px]">
        {rows.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-faint">{k}</dt>
            <dd className="font-mono text-ink">{v}</dd>
          </div>
        ))}
      </dl>
    </Panel>
  );
}

function TruthAndLimitations() {
  const points = [
    "Deterministic VentureOS policy is the sole authority for every decision here.",
    "NVIDIA JailbreakDetect is a supplementary classifier; its raw score is not a calibrated probability and its boolean may not fire on every attack.",
    "The score interpretation shown is VentureOS-defined for this demo, not supplied by NVIDIA.",
    "A provider outage never bypasses policy and never bricks a safe request (deterministic fallback).",
    "No Production request is intercepted, no mission or audit state changes, and no action is executed.",
    "Curefoods only. There is no free-form public prompt box — every request is a curated, auditable scenario.",
  ];
  return (
    <Panel title="Truth & limitations" icon={<AlertTriangle size={16} />}>
      <ul className="space-y-1.5">
        {points.map((p) => (
          <li key={p} className="flex items-start gap-2 text-[12px] text-muted">
            <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-faint" /> {p}
          </li>
        ))}
      </ul>
    </Panel>
  );
}

// ---------------------------------------------------------------------------
// Root
// ---------------------------------------------------------------------------

export function GuardrailsLab() {
  const [scenarioId, setScenarioId] = useState(GUARDRAIL_SCENARIOS[0].id);
  const [mode, setMode] = useState<Mode>("live");
  const [data, setData] = useState<ClassifyResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const scenario = useMemo(
    () => GUARDRAIL_SCENARIOS.find((s) => s.id === scenarioId) ?? GUARDRAIL_SCENARIOS[0],
    [scenarioId],
  );

  // Instant, local deterministic preview (pure, no secret, no network).
  const localFindings = useMemo(() => evaluateRails(scenario.requestText), [scenario.requestText]);
  const localDecision = useMemo(() => deriveDeterministicDecision(localFindings), [localFindings]);

  const runClassify = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/guardrails/classify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scenarioId: scenario.id, mode }),
      });
      if (!res.ok) {
        setError(`classify failed (${res.status})`);
        setData(null);
        return;
      }
      const body = (await res.json()) as ClassifyResponse;
      setData(body);
    } catch {
      setError("classify request failed");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [scenario.id, mode]);

  useEffect(() => {
    void runClassify();
  }, [runClassify]);

  const evaluation = data?.evaluation ?? null;
  const decision = evaluation?.finalDecision ?? localDecision;

  return (
    <div className="mx-auto w-full max-w-[1100px] px-5 py-6">
      <FeatureBranchStatus />

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,340px)_minmax(0,1fr)]">
        {/* Left rail: briefing + scenario selector */}
        <div className="space-y-4">
          <GuardrailBriefing />
          <Panel title="Scenario" icon={<FlaskConical size={16} />}>
            <div className="space-y-1.5">
              {GUARDRAIL_SCENARIOS.map((s) => {
                const active = s.id === scenarioId;
                return (
                  <button
                    key={s.id}
                    onClick={() => setScenarioId(s.id)}
                    className={`w-full rounded-lg border px-3 py-2 text-left transition-colors ${
                      active ? "border-brand/50 bg-brand/10" : "border-edge bg-surface2 hover:border-edge-soft"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[12px] font-medium text-ink">{s.title}</span>
                      {s.tier === "optional" && <Chip tone="edge">optional</Chip>}
                    </div>
                    <div className="text-[11px] text-muted">{s.summary}</div>
                  </button>
                );
              })}
            </div>
          </Panel>

          <Panel title="Classifier mode" icon={<Cpu size={16} />}>
            <div className="flex gap-2">
              {(["live", "forced_fallback"] as Mode[]).map((m) => (
                <button
                  key={m}
                  onClick={() => setMode(m)}
                  className={`flex-1 rounded-lg border px-2 py-1.5 text-[11px] font-medium transition-colors ${
                    mode === m ? "border-brand/50 bg-brand/10 text-brand-bright" : "border-edge bg-surface2 text-faint hover:text-muted"
                  }`}
                >
                  {m === "live" ? "Live NVIDIA" : "Forced fallback"}
                </button>
              ))}
            </div>
            <p className="mt-2 text-[10px] text-faint">
              Forced fallback proves a provider outage never bypasses policy — testable without a real failure.
            </p>
          </Panel>
        </div>

        {/* Right column: evaluation */}
        <div className="space-y-4">
          <FinalDecision decision={decision} requiresHumanReview={evaluation?.requiresHumanReview ?? false} />

          <Panel title="Original request" icon={<Activity size={16} />}>
            <div className="mb-1 flex items-center gap-2">
              <Chip tone="brand">Curefoods</Chip>
              <Chip tone="edge">{scenario.title}</Chip>
            </div>
            <p className="rounded-lg border border-edge bg-surface2 px-3 py-2 font-mono text-[12px] leading-relaxed text-muted">
              {scenario.requestText}
            </p>
          </Panel>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <DeterministicRailResults findings={evaluation?.findings ?? localFindings} />
            <NvidiaClassification evaluation={evaluation} loading={loading} />
          </div>

          <Panel title="Safe response" icon={<ShieldCheck size={16} />}>
            <p className="text-[13px] leading-relaxed text-muted">
              {evaluation?.safeResponse ?? scenario.safeResponse}
            </p>
          </Panel>

          <ActionBoundary />
          <AuditProjection audit={data?.audit ?? null} />
          <TruthAndLimitations />

          {error && (
            <div className="rounded-lg border border-risk/40 bg-risk/10 px-3 py-2 text-[12px] text-risk">
              {error} — deterministic preview remains valid above.
            </div>
          )}
        </div>
      </div>

      <footer className="mt-8 border-t border-edge pt-4 text-center text-[11px] text-faint">
        Guardrails Lab · Feature Branch · references {CUREFOODS_AUDIT_REF} read-only ·{" "}
        <Link href="/" className="text-brand-dim hover:text-brand-bright">
          return to Signal-to-Action Agent
        </Link>
      </footer>
    </div>
  );
}
