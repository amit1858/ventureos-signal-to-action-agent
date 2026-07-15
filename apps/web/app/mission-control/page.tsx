// Release 2.2 — Mission Control · renewal-risk screen route (F1.7)
// ================================================================
// Server route for the guided renewal-risk Mission Control experience. It renders
// the live client loader, which runs the governed mission through the real
// Next.js Mission BFF -> Python Adaptive Mission Harness -> TypeScript Memory +
// Conversation Runtime and hands ONE governed `MissionTurn` to the shared
// presentation surface. An honest, labeled offline demo turn is shown only when
// the live mission service is unavailable.

import { MissionControlLive } from "@/components/missions/MissionControlLive";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Mission Control · Renewal risk",
};

export default function MissionControlPage() {
  return (
    <main className="min-h-screen bg-base">
      <MissionControlLive />
    </main>
  );
}
