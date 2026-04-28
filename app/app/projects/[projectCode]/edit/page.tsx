"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { use, useEffect, useState } from "react";
import { Breadcrumb } from "@/components/layout/Breadcrumb";
import { PortfolioMap } from "@/components/map/PortfolioMap";
import { ProjectAmenitiesPanel } from "@/components/property/amenities/ProjectAmenitiesPanel";
import { toastError, toastSuccess } from "@/components/ui/Toaster";
import { api } from "@/lib/trpc/react";

export default function EditProjectPage({
  params,
}: {
  params: Promise<{ projectCode: string }>;
}) {
  const { projectCode } = use(params);
  const router = useRouter();
  const utils = api.useUtils();
  const project = api.project.byCode.useQuery(
    { code: projectCode.toUpperCase() },
    { retry: false },
  );
  const update = api.project.update.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.project.list.invalidate(),
        utils.project.byCode.invalidate({ code: projectCode.toUpperCase() }),
      ]);
      toastSuccess("Project saved");
      router.push(`/app/projects/${projectCode.toUpperCase()}`);
      router.refresh();
    },
    onError: (e) => toastError(e.message),
  });
  const remove = api.project.delete.useMutation({
    onSuccess: async () => {
      await utils.project.list.invalidate();
      toastSuccess(`Deleted project ${projectCode.toUpperCase()}`);
      router.push("/app");
      router.refresh();
    },
    onError: (e) => toastError(e.message),
  });

  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");
  const [description, setDescription] = useState("");

  // Hydrate form once project loads.
  useEffect(() => {
    if (!project.data) return;
    setName(project.data.name ?? "");
    setAddress(project.data.address ?? "");
    setLat(project.data.lat != null ? String(project.data.lat) : "");
    setLng(project.data.lng != null ? String(project.data.lng) : "");
    setDescription(project.data.description ?? "");
  }, [project.data]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!project.data?.id) return;
    update.mutate({
      id: project.data.id,
      name,
      address: address || null,
      lat: lat ? Number(lat) : null,
      lng: lng ? Number(lng) : null,
      description: description || null,
    });
  }

  function handleDelete() {
    if (!project.data?.id) return;
    if (
      !confirm(
        `Delete project ${project.data.code}? This removes its buildings, bays, spaces, leases, and documents. This cannot be undone.`,
      )
    ) {
      return;
    }
    remove.mutate({ id: project.data.id });
  }

  // Pin the current lat/lng on the map so the user can see what they typed.
  const pins =
    lat && lng
      ? [
          {
            id: project.data?.id ?? "pending",
            code: projectCode.toUpperCase(),
            name: name || "This project",
            lat: Number(lat),
            lng: Number(lng),
          },
        ]
      : [];

  return (
    <main className="flex h-screen flex-col">
      <header className="flex items-center justify-between border-b border-neutral-200 bg-white px-6 py-4">
        <div>
          <Breadcrumb
            crumbs={[
              {
                label: projectCode.toUpperCase(),
                href: `/app/projects/${projectCode.toUpperCase()}`,
              },
              { label: "Edit" },
            ]}
          />
          <h1 className="mt-1 text-lg font-semibold">Edit project</h1>
          <p className="text-sm text-neutral-500">
            Click anywhere on the map to set or move the pin.
          </p>
        </div>
      </header>

      <section className="grid flex-1 grid-cols-1 overflow-hidden lg:grid-cols-[420px_1fr]">
        <form onSubmit={handleSubmit} className="flex flex-col gap-4 overflow-y-auto bg-white p-6">
          <Field label="Code">
            <input
              value={projectCode.toUpperCase()}
              disabled
              className={`${inputClass} bg-neutral-100 text-neutral-500`}
            />
          </Field>

          <Field label="Name">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className={inputClass}
            />
          </Field>

          <Field label="Address">
            <input
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              className={inputClass}
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Latitude">
              <input
                value={lat}
                onChange={(e) => setLat(e.target.value)}
                inputMode="decimal"
                className={inputClass}
              />
            </Field>
            <Field label="Longitude">
              <input
                value={lng}
                onChange={(e) => setLng(e.target.value)}
                inputMode="decimal"
                className={inputClass}
              />
            </Field>
          </div>
          <p className="-mt-2 text-xs text-neutral-500">
            Tip: click on the map to fill these in.
          </p>

          <Field label="Description">
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              className={inputClass}
            />
          </Field>

          {update.error && (
            <p className="text-sm text-red-600">{update.error.message}</p>
          )}
          {remove.error && (
            <p className="text-sm text-red-600">{remove.error.message}</p>
          )}

          <div className="flex items-center justify-between gap-2 pt-2">
            <button
              type="button"
              onClick={handleDelete}
              disabled={remove.isPending}
              className="rounded-md border border-red-200 bg-white px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
            >
              {remove.isPending ? "Deleting…" : "Delete project"}
            </button>
            <div className="flex gap-2">
              <Link
                href={`/app/projects/${projectCode.toUpperCase()}`}
                className="rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
              >
                Cancel
              </Link>
              <button
                type="submit"
                disabled={update.isPending}
                className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50"
              >
                {update.isPending ? "Saving…" : "Save changes"}
              </button>
            </div>
          </div>
        </form>

        <div className="relative">
          <PortfolioMap
            projects={pins}
            onMapClick={({ lat: la, lng: lo }) => {
              setLat(la.toFixed(6));
              setLng(lo.toFixed(6));
            }}
          />
        </div>
      </section>

      {project.data?.id && lat && lng && (
        <section className="border-t border-neutral-200 bg-neutral-50 p-6">
          <ProjectAmenitiesPanel
            projectId={project.data.id}
            center={[Number(lng), Number(lat)]}
            initialParcel={
              (project.data as { parcel_polygon?: unknown }).parcel_polygon
            }
            initialAccessPoints={
              (project.data as { access_points?: unknown }).access_points
            }
          />
        </section>
      )}
    </main>
  );
}

const inputClass =
  "w-full rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-sm focus:border-neutral-900 focus:outline-none focus:ring-1 focus:ring-neutral-900";

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-medium uppercase tracking-wide text-neutral-500">
        {label}
      </span>
      {children}
    </label>
  );
}
