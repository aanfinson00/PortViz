"use client";

import type { Polygon } from "geojson";
import { useMemo, useState } from "react";
import {
  BuildingExtrusionMap,
  type BuildingGeom,
} from "@/components/map/BuildingExtrusionMap";
import {
  AmenitiesLegend,
  type AllAmenityToggles,
} from "@/components/property/amenities/AmenitiesLegend";
import {
  buildAmenityLayers,
  type AmenityBuilding,
} from "@/components/property/amenities/buildAmenityLayers";
import {
  buildProjectAmenityLayers,
  type ProjectAmenityInput,
} from "@/components/property/amenities/buildProjectAmenityLayers";
import {
  buildBuildingMapGeoms,
  type BuildingForRendering,
} from "@/lib/buildingMapGeoms";

interface PropertyHeroProps {
  /**
   * Buildings with everything the demising-aware renderer needs:
   * footprint, height, bays, slider-mode spaces with office buildouts.
   * Shared with the building detail page via lib/buildingMapGeoms so
   * the project hero and building page produce identical visuals.
   */
  buildings: BuildingForRendering[];
  fallbackCenter?: [number, number] | null;
  /**
   * Optional building-level amenity inputs (bays per building +
   * truck-court depth). When provided, the hero composes a "Site
   * amenities" overlay with toggles in a small legend. Omit to render
   * the plain 3D view.
   */
  amenities?: AmenityBuilding[];
  /**
   * Optional project-level amenities (parcel boundary + access points).
   * Independent of `amenities` so a project with one but not the other
   * still renders cleanly.
   */
  projectAmenities?: ProjectAmenityInput;
  /** Show a translucent overlay over the map while data is loading. */
  isLoading?: boolean;
}

/**
 * Full-width 3D site view at the top of the property page. Renders all of
 * the project's buildings (with footprints) as fill-extrusions on Mapbox.
 * Falls back to a static placeholder when there are no footprints to show.
 */
export function PropertyHero({
  buildings,
  fallbackCenter,
  amenities,
  projectAmenities,
  isLoading = false,
}: PropertyHeroProps) {
  const [toggles, setToggles] = useState<AllAmenityToggles>({
    docks: true,
    truckCourts: true,
    parcel: true,
    accessPoints: true,
    parking: true,
    yard: true,
  });

  const overlayLayers = useMemo(() => {
    const layers = [];
    if (amenities) layers.push(...buildAmenityLayers(amenities, toggles));
    if (projectAmenities) {
      layers.push(...buildProjectAmenityLayers(projectAmenities, toggles));
    }
    return layers.length > 0 ? layers : undefined;
  }, [amenities, projectAmenities, toggles]);

  const available = useMemo(
    () => ({
      parcel: !!projectAmenities?.parcel,
      accessPoints: (projectAmenities?.accessPoints?.length ?? 0) > 0,
      parking: (projectAmenities?.parking?.length ?? 0) > 0,
      yard: (projectAmenities?.yard?.length ?? 0) > 0,
    }),
    [projectAmenities],
  );

  const mapBuildings: BuildingGeom[] = useMemo(
    () => buildings.flatMap(buildBuildingMapGeoms),
    [buildings],
  );

  // Union bbox across every building's footprint *and* the parcel polygon
  // when set, so a parcel that extends past the buildings still fits in
  // the camera frame.
  const bounds = useMemo<[[number, number], [number, number]] | null>(() => {
    let w = Infinity;
    let s = Infinity;
    let e = -Infinity;
    let n = -Infinity;
    const expand = (poly: Polygon) => {
      for (const ring of poly.coordinates) {
        for (const [x, y] of ring) {
          if (x < w) w = x;
          if (x > e) e = x;
          if (y < s) s = y;
          if (y > n) n = y;
        }
      }
    };
    for (const b of mapBuildings) expand(b.footprint!);
    if (projectAmenities?.parcel) expand(projectAmenities.parcel);
    for (const area of projectAmenities?.parking ?? []) {
      expand(area.polygon);
    }
    for (const area of projectAmenities?.yard ?? []) {
      expand(area.polygon);
    }
    return Number.isFinite(w) ? [[w, s], [e, n]] : null;
  }, [mapBuildings, projectAmenities]);

  const center = useMemo<[number, number] | null>(() => {
    if (bounds) {
      return [
        (bounds[0][0] + bounds[1][0]) / 2,
        (bounds[0][1] + bounds[1][1]) / 2,
      ];
    }
    return fallbackCenter ?? null;
  }, [bounds, fallbackCenter]);

  if (!center) {
    return (
      <div className="flex h-72 w-full items-center justify-center rounded-md border border-dashed border-neutral-300 bg-neutral-50 text-sm text-neutral-500">
        No location or footprint to show. Set the property location, then add a
        building.
      </div>
    );
  }

  const showLegend =
    (amenities && amenities.length > 0) || projectAmenities != null;

  return (
    <div className="relative h-72 w-full overflow-hidden rounded-md border border-neutral-200">
      <BuildingExtrusionMap
        center={center}
        buildings={mapBuildings}
        bounds={bounds}
        overlayLayers={overlayLayers}
      />
      {showLegend && (
        <AmenitiesLegend
          toggles={toggles}
          onChange={setToggles}
          available={available}
          parkingKind={projectAmenities?.parking?.[0]?.kind ?? null}
        />
      )}
      {isLoading && mapBuildings.length === 0 && (
        <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center bg-white/40 backdrop-blur-sm">
          <div className="rounded-md bg-white px-3 py-1.5 text-xs font-medium text-neutral-600 shadow-sm">
            Loading site…
          </div>
        </div>
      )}
    </div>
  );
}
