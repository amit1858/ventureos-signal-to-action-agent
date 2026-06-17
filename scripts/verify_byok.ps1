# Phase 5.0A.2 — BYOK live verification for the Signal-to-Action Agent.
#
# Hits every BYOK endpoint with the keys you supply and prints a one-screen
# "Connected | Model | Latency | Status" report you can screenshot.
#
# USAGE:
#   $env:OPENAI_API_KEY = "sk-..."
#   $env:ANTHROPIC_API_KEY = "sk-ant-..."
#   $env:NVIDIA_API_KEY = "nvapi-..."   # optional
#   pwsh ./scripts/verify_byok.ps1
#
# Keys live only in the current PowerShell process, are sent only to the local
# backend and the provider's own API, and are never logged or persisted by
# this script.

param(
    [string]$ApiBase = "http://127.0.0.1:8000"
)

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

$openai    = $env:OPENAI_API_KEY
$anthropic = $env:ANTHROPIC_API_KEY
$nvidia    = $env:NVIDIA_API_KEY

function Mask($s) {
    if (-not $s) { return "(unset)" }
    if ($s.Length -le 10) { return "($($s.Length) chars)" }
    return $s.Substring(0,6) + "..." + $s.Substring($s.Length - 4)
}

Write-Host "==================================================================="
Write-Host " Signal-to-Action Agent - BYOK live verification (Phase 5.0A.2)"
Write-Host "==================================================================="
Write-Host (" API base : {0}" -f $ApiBase)
Write-Host (" OpenAI   : {0}" -f (Mask $openai))
Write-Host (" Anthropic: {0}" -f (Mask $anthropic))
Write-Host (" NVIDIA   : {0}" -f (Mask $nvidia))
Write-Host ""

try {
    $h = Invoke-RestMethod -Uri "$ApiBase/api/health" -TimeoutSec 5
    Write-Host (" Backend  : OK ({0})" -f $h.status) -ForegroundColor Green
}
catch {
    Write-Host " Backend  : UNREACHABLE - start it first." -ForegroundColor Red
    exit 1
}

$rows = @()

function VerifyProvider {
    param([string]$Provider, [string]$Key, [string]$Label)

    Write-Host ""
    Write-Host ("=== {0} ===" -f $Label) -ForegroundColor Cyan
    if (-not $Key) {
        Write-Host " (skipped - no key in env)" -ForegroundColor DarkGray
        return @{ provider = $Provider; status = "skipped"; ok = $false; model = ""; model_id = ""; latency_ms = 0; source = "-"; models = 0 }
    }

    $headers = @{ "X-Byok-Api-Key" = $Key }
    try {
        $disc = Invoke-RestMethod -Uri "$ApiBase/api/decision-providers/models/$Provider" -Headers $headers -TimeoutSec 30
        Write-Host (" discovery : source={0}  models={1}  recommended={2}" -f $disc.source, $disc.models.Count, $disc.recommended)
        if ($disc.discovery_error) {
            Write-Host ("             error    : {0} - {1}" -f $disc.discovery_error.category, $disc.discovery_error.message) -ForegroundColor Yellow
        }
    }
    catch {
        Write-Host (" discovery : FAILED - {0}" -f $_.Exception.Message) -ForegroundColor Red
        return @{ provider = $Provider; status = "discovery_failed"; ok = $false; model = ""; model_id = ""; latency_ms = 0; source = "-"; models = 0 }
    }

    $body = @{ provider = $Provider; api_key = $Key; model = $disc.recommended; base_url = "" } | ConvertTo-Json
    try {
        $test = Invoke-RestMethod -Uri "$ApiBase/api/decision-providers/test" -Method Post -ContentType "application/json" -Body $body -TimeoutSec 60
    }
    catch {
        Write-Host (" test      : EXCEPTION - {0}" -f $_.Exception.Message) -ForegroundColor Red
        return @{ provider = $Provider; status = "exception"; ok = $false; model = $disc.recommended; model_id = $disc.recommended; latency_ms = 0; source = $disc.source; models = $disc.models.Count }
    }

    if ($test.ok) {
        Write-Host (" test      : Connected   provider={0}  model={1}  latency={2} ms" -f $test.provider_label, $test.model_display, $test.latency_ms) -ForegroundColor Green
    }
    else {
        Write-Host (" test      : Failed       status={0}  category={1}  msg={2}" -f $test.status, $test.error_category, $test.error) -ForegroundColor Red
    }

    return @{
        provider   = $Provider
        status     = $test.status
        ok         = [bool]$test.ok
        model      = $test.model_display
        model_id   = $test.model
        latency_ms = $test.latency_ms
        source     = $disc.source
        models     = $disc.models.Count
    }
}

$rows += VerifyProvider "openai"    $openai    "OpenAI"
$rows += VerifyProvider "anthropic" $anthropic "Anthropic Claude"
$rows += VerifyProvider "nvidia"    $nvidia    "NVIDIA Nemotron"

Write-Host ""
Write-Host "=== Live Compare Run ===" -ForegroundColor Cyan
$healthy = $rows | Where-Object { $_.ok }
if ($healthy.Count -lt 1) {
    Write-Host " skipped - no provider connected" -ForegroundColor DarkGray
}
else {
    $accountId = "ACC-0016"
    $creds = @{}
    foreach ($r in $rows) {
        $envKey = switch ($r.provider) {
            "openai"    { $openai }
            "anthropic" { $anthropic }
            "nvidia"    { $nvidia }
        }
        if ($r.ok -and $envKey) {
            $creds[$r.provider] = @{ api_key = $envKey; model = $r.model_id; base_url = "" }
        }
    }
    $body = @{ credentials = $creds } | ConvertTo-Json -Depth 6
    try {
        $cmp = Invoke-RestMethod -Uri "$ApiBase/api/decision-providers/compare/$accountId" -Method Post -ContentType "application/json" -Body $body -TimeoutSec 120
        Write-Host (" account   : {0}" -f $cmp.account_name)
        foreach ($p in $cmp.providers) {
            Write-Host ("   - {0,-13}  mode={1,-10}  risk={2,-8}  opp={3,-8}  action={4,-22}  conf={5,-7}  latency={6,5} ms" -f $p.provider, $p.mode, $p.risk_level, $p.opportunity_level, $p.recommended_action, $p.confidence, $p.latency_ms)
        }
    }
    catch {
        Write-Host (" compare   : FAILED - {0}" -f $_.Exception.Message) -ForegroundColor Red
    }
}

Write-Host ""
Write-Host "==================================================================="
Write-Host " SUMMARY"
Write-Host "==================================================================="
foreach ($r in $rows) {
    $glyph = if ($r.ok) { "[CONNECTED]" } elseif ($r.status -eq "skipped") { "[ SKIPPED ]" } else { "[ FAILED  ]" }
    Write-Host (" {0,-12} {1}  model={2,-32} latency={3,5} ms   discovery={4} ({5} models)" -f $r.provider, $glyph, $r.model, $r.latency_ms, $r.source, $r.models)
}
Write-Host ""
