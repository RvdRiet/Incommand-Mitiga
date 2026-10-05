"use client";

import { ErrorBoundary } from "@/components/errors/ErrorBoundary";

import { MODULE_VIEW_LOADERS, DefaultModuleView } from "./module-loaders";
import { ModulePageHeader } from "./ModulePageHeader";

export type { ModuleViewProps } from "./module-loaders";

/**
 * Views that render their own distinctive header (a hero, a rich toolbar header, or a
 * full-bleed map) opt out of the shared page header so we never double up. Everything
 * else — the data tables and simple lists — gets the consistent title + description.
 */
const SELF_HEADER = new Set([
  "situation",
  "map",
  "comms",
  "rostering",
  "certifications",
  "inventory",
  "analytics",
  "outages",
  "track-history",
  "weather",
  "tasks",
  "plays",
  "briefings",
  "notifications",
]);

function usesSharedHeader(slug: string) {
  return Boolean(slug) && !slug.startsWith("hub-") && !SELF_HEADER.has(slug);
}

export function ModuleView({
  slug,
  searchActive = false,
  filterActive = false,
  orgChartOpen = false,
}: {
  slug: string;
  searchActive?: boolean;
  filterActive?: boolean;
  orgChartOpen?: boolean;
}) {
  const View = MODULE_VIEW_LOADERS[slug] ?? DefaultModuleView;
  const viewProps = { searchActive, filterActive, orgChartOpen };
  // `key={slug}` so a crashed module resets automatically when the commander
  // navigates to a different one — a failed panel never wedges the whole console.
  if (!slug) {
    return (
      <ErrorBoundary name={slug || "module"}>
        <View {...viewProps} />
      </ErrorBoundary>
    );
  }
  return (
    <div className="ic-view">
      {usesSharedHeader(slug) ? <ModulePageHeader slug={slug} /> : null}
      <ErrorBoundary key={slug} name={slug}>
        <View {...viewProps} />
      </ErrorBoundary>
    </div>
  );
}
