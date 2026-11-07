"use client";

import { HostGate } from "@/components/HostGate";
import { CompetitionEditor } from "@/components/CompetitionEditor";

export default function NewCompetitionPage() {
  return <HostGate>{() => <CompetitionEditor />}</HostGate>;
}
