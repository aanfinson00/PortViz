"use client";

import Link from "next/link";
import { useMemo } from "react";
import {
  BayQuickSetup,
  DemisingEditor,
} from "@/components/demising/DemisingEditor";
import type { Bay, FrontageSide, SpaceGroup } from "@/lib/demising";
import { api } from "@/lib/trpc/react";

interface BuildingPanelProps {
  buildingId: string;
  projectCode: string;
  buildingCode: string;
  onClose: () => void;
}

/**
 * Slide-out side panel that mounts a building's demising editor right on top
 * of the portfolio map. Avoids the click-through to the dedicated building
 * page when all the user wants is to tweak demising or look at the bays.
 */
export function BuildingPanel({
  buildingId,
  projectCode,
  buildingCode,
  onClose,
}: BuildingPanelProps) {
  const baysQuery = api.bay.listByBuilding.useQuery(
    { buildingId },
    { retry: false },
  );
  const spacesQuery = api.space.listByBuilding.useQuery(
    { buildingId },
    { retry: false },
  );

  const bays: Bay[] = useMemo(
    () =>
      (baysQuery.data ?? []).map(
        (b: {
          id: string;
          ordinal: number;
          width_ft: number;
          depth_ft: number;
          dock_door_count: number;
          drive_in_count: number;
          has_yard_access: boolean;
          frontage_side: string;
        }) => ({
          id: b.id,
          ordinal: b.ordinal,
          widthFt: Number(b.width_ft),
          depthFt: Number(b.depth_ft),
          dockDoorCount: b.dock_door_count,
          driveInCount: b.drive_in_count,
          hasYardAccess: b.has_yard_access,
          frontageSide: b.frontage_side as FrontageSide,
        }),
      ),
    [baysQuery.data],
  );

  const initialGroups: SpaceGroup[] = useMemo(() => {
    return (spacesQuery.data ?? [])
      .map(
        (s: {
          id: string;
          code: string;
          space_bay: { bay_id: string }[] | null;
        }) => ({
          id: s.id,
          code: s.code,
          bayIds: (s.space_bay ?? []).map((sb) => sb.bay_id),
        }),
      )
      .filter((g) => g.bayIds.length > 0);
  }, [spacesQuery.data]);

  return (
    <aside className="absolute right-0 top-0 z-20 flex h-full w-full max-w-md flex-col overflow-y-auto border-l border-neutral-200 bg-white shadow-xl">
      <header className="flex items-start justify-between border-b border-neutral-200 px-4 py-3">
        <div>
          <p className="font-mono text-xs text-neutral-500">
            {projectCode}-{buildingCode}
          </p>
          <h2 className="text-sm font-semibold">Demising</h2>
        </div>
        <button
          onClick={onClose}
          className="rounded-md border border-neutral-200 bg-white px-2 py-1 text-xs text-neutral-600 hover:bg-neutral-50"
        >
          Close
        </button>
      </header>

      <div className="flex-1 p-4">
        {baysQuery.isLoading ? (
          <p className="text-sm text-neutral-500">Loading bays…</p>
        ) : bays.length === 0 ? (
          <BayQuickSetup buildingId={buildingId} />
        ) : (
          <DemisingEditor
            buildingId={buildingId}
            bays={bays}
            totalCarParking={0}
            totalTrailerParking={0}
            initialGroups={initialGroups}
          />
        )}
      </div>

      <footer className="border-t border-neutral-200 px-4 py-3 text-xs">
        <Link
          href={`/app/projects/${projectCode}/buildings/${buildingCode}`}
          className="text-blue-600 hover:underline"
        >
          Open full building page →
        </Link>
      </footer>
    </aside>
  );
}
