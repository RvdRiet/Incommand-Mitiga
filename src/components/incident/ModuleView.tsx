"use client";

import { MODULE_VIEW_LOADERS, DefaultModuleView } from "./module-loaders";

export type { ModuleViewProps } from "./module-loaders";

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
  if (!slug) {
    return <View {...viewProps} />;
  }
  return (
    <div className="ic-view">
      <View {...viewProps} />
    </div>
  );
}
