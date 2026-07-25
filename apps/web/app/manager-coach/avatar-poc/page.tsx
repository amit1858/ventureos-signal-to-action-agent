// Manager Coach — POC route (/manager-coach/avatar-poc).
//
// Dedicated, isolated route that presents the Soul Machines Digital Person as
// the AI Sales Director. It is deliberately NOT wired into the platform shell
// navigation. When the POC flag is disabled the route returns notFound(), so no
// Soul Machines resources load and the surface does not exist.

import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { AvatarPocClient } from "@/components/manager-coach/AvatarPocClient";
import { getAssistantUrl, isSoulMachinesPocEnabled } from "@/lib/soul-machines/config";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Manager Coach — POC · AI Sales Director",
  robots: { index: false, follow: false },
};

export default function ManagerCoachAvatarPocPage() {
  // Fail closed: the experimental route only exists when explicitly enabled.
  if (!isSoulMachinesPocEnabled()) {
    notFound();
  }

  return <AvatarPocClient assistantUrl={getAssistantUrl()} />;
}
