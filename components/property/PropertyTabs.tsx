"use client";

import { useState, type ReactNode } from "react";

export type TabKey = "rent_roll" | "expirations" | "tenants" | "documents";

interface PropertyTabsProps {
  children: Record<TabKey, ReactNode>;
  /** Optional badge text per tab — e.g. counts. */
  badges?: Partial<Record<TabKey, string>>;
  defaultTab?: TabKey;
}

const TABS: { key: TabKey; label: string }[] = [
  { key: "rent_roll", label: "Rent roll" },
  { key: "expirations", label: "Expirations" },
  { key: "tenants", label: "Tenants" },
  { key: "documents", label: "Documents" },
];

export function PropertyTabs({
  children,
  badges = {},
  defaultTab = "rent_roll",
}: PropertyTabsProps) {
  const [active, setActive] = useState<TabKey>(defaultTab);

  return (
    <div className="flex flex-col gap-3">
      <nav className="flex gap-1 border-b border-neutral-200">
        {TABS.map((t) => {
          const isActive = active === t.key;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setActive(t.key)}
              className={`flex items-center gap-2 border-b-2 px-3 py-2 text-sm font-medium transition ${
                isActive
                  ? "border-neutral-900 text-neutral-900"
                  : "border-transparent text-neutral-500 hover:text-neutral-800"
              }`}
            >
              {t.label}
              {badges[t.key] && (
                <span
                  className={`rounded-full px-1.5 py-0.5 text-[10px] ${
                    isActive
                      ? "bg-neutral-900 text-white"
                      : "bg-neutral-100 text-neutral-600"
                  }`}
                >
                  {badges[t.key]}
                </span>
              )}
            </button>
          );
        })}
      </nav>
      <div>{children[active]}</div>
    </div>
  );
}
