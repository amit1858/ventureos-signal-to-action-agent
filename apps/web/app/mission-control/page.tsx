// Release 2.2 — Mission Control · renewal-risk screen route (F1.7)
// ================================================================
// Server route for the guided renewal-risk Mission Control experience. It renders
// the live client loader, which runs the governed mission through the real
// Next.js Mission BFF -> Python Adaptive Mission Harness -> TypeScript Memory +
// Conversation Runtime and hands ONE governed `MissionTurn` to the shared
// presentation surface. An honest, labeled offline demo turn is shown only when
// the live mission service is unavailable.

import { MissionControlLive } from "@/components/missions/MissionControlLive";
import { MissionControlHeader } from "@/components/shell/MissionControlHeader";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Mission Control · Renewal risk",
};

export default function MissionControlPage() {
  return (
    <div className="flex min-h-screen flex-col bg-base">
      <MissionControlHeader />
      <main className="flex-1">
        <MissionControlLive />
      </main>
    </div>
  );
}
