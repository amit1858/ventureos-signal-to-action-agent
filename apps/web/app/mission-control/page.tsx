// Release 2.2 — Mission Control · renewal-risk screen route (F1.7)
// ================================================================
// Server route for the guided renewal-risk Mission Control experience. It builds
// the deterministic demo turn on the server (through the same F1.5 adapter + F1.6
// assembler the live BFF uses) and hands ONE governed `MissionTurn` to the shared
// presentation surface. No client fetch, no running Python service required.

import { buildRenewalDemoTurn } from "@/lib/missions/demo";
import { MissionControl } from "@/components/missions/MissionControl";

export const dynamic = "force-static";

export const metadata = {
  title: "Mission Control · Renewal risk",
};

export default function MissionControlPage() {
  const turn = buildRenewalDemoTurn();
  return (
    <main className="min-h-screen bg-base">
      <MissionControl turn={turn} />
    </main>
  );
}
