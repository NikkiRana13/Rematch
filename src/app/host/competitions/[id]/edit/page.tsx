"use client";

import { use } from "react";
import { HostGate } from "@/components/HostGate";
import { CompetitionEditor } from "@/components/CompetitionEditor";

export default function EditCompetitionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <HostGate>{() => <CompetitionEditor competitionId={id} />}</HostGate>;
}
