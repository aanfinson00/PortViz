"use client";

import { useMemo, useState } from "react";
import { api } from "@/lib/trpc/react";
import { ScenarioEditor } from "./ScenarioEditor";
import { ScenarioList } from "./ScenarioList";
import type { SchemeRow } from "./types";

interface Props {
  buildingId: string;
  totalSf: number;
  demisingMode: "sliders" | "bays";
  /** Building's bays — needed for bay-mode snapshot resolution. */
  bays: Array<{ id: string; widthFt: number; depthFt: number }>;
}

/**
 * Sidebar panel that lists scenarios for a building and opens an editor
 * drawer when one is selected. Lives in the demising sidebar of the
 * building detail page — see app/app/projects/[projectCode]/buildings/
 * [buildingCode]/page.tsx.
 */
export function ScenarioPlanner({
  buildingId,
  totalSf,
  demisingMode,
  bays,
}: Props) {
  const schemes = api.demising.listSchemes.useQuery(
    { buildingId },
    { retry: false },
  );

  const bayAreaById = useMemo(() => {
    const m = new Map<string, number>();
    for (const b of bays) m.set(b.id, b.widthFt * b.depthFt);
    return m;
  }, [bays]);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingNew, setEditingNew] = useState(false);

  const selected: SchemeRow | null = useMemo(() => {
    if (!selectedId) return null;
    const rows = (schemes.data ?? []) as SchemeRow[];
    return rows.find((r) => r.id === selectedId) ?? null;
  }, [schemes.data, selectedId]);

  function handleNew() {
    setEditingNew(true);
    setSelectedId(null);
    setEditorOpen(true);
  }

  function handleSelect(id: string | null) {
    setSelectedId(id);
    if (id) {
      setEditingNew(false);
      setEditorOpen(true);
    }
  }

  return (
    <>
      <ScenarioList
        buildingId={buildingId}
        totalSf={totalSf}
        bayAreaById={bayAreaById}
        selectedId={selectedId}
        onSelect={handleSelect}
        onNew={handleNew}
      />
      {editorOpen && (
        <ScenarioEditor
          buildingId={buildingId}
          totalSf={totalSf}
          mode={demisingMode}
          scheme={editingNew ? null : selected}
          bayAreaById={bayAreaById}
          onClose={() => setEditorOpen(false)}
          onSaved={(id) => {
            setSelectedId(id);
            setEditingNew(false);
            setEditorOpen(false);
          }}
        />
      )}
    </>
  );
}
