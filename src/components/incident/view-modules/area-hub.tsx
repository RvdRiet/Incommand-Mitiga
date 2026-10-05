"use client";

import Link from "next/link";

import { useEventId } from "@/context/EventContext";
import { usePermissions } from "@/context/PermissionsContext";
import {
  getAreaByHubSlug,
  getModuleBySlug,
  moduleHref,
  type NavArea,
} from "@/lib/navigation/modules";

/**
 * An area landing page: the area's title and description, then a card grid of the tools
 * it contains. This is the "make sense of it" layer — a newcomer opens an area and sees
 * its options spelled out with plain-language descriptions, instead of hunting a sidebar.
 */
function AreaHub({ area }: { area: NavArea }) {
  const eventId = useEventId();
  const { canSee } = usePermissions();
  const tools = area.moduleSlugs
    .filter((slug) => canSee(slug))
    .map((slug) => getModuleBySlug(slug))
    .filter((m): m is NonNullable<typeof m> => Boolean(m));

  return (
    <section className="ic-hub">
      <header className="ic-hub__head">
        <span className="ic-hub__icon">
          <area.icon />
        </span>
        <div>
          <h1 className="ic-hub__title">{area.label}</h1>
          <p className="ic-hub__desc">{area.description}</p>
        </div>
      </header>

      <div className="ic-hub__grid">
        {tools.map((m) => (
          <Link
            key={m.slug || "dashboard"}
            href={moduleHref(eventId, m.slug)}
            className="ic-hub-card"
          >
            <span className="ic-hub-card__icon">
              <m.icon />
            </span>
            <span className="ic-hub-card__body">
              <span className="ic-hub-card__title">{m.label}</span>
              {m.description ? (
                <span className="ic-hub-card__desc">{m.description}</span>
              ) : null}
            </span>
            <span className="ic-hub-card__go" aria-hidden>
              →
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}

function hubFor(hubSlug: string) {
  const area = getAreaByHubSlug(hubSlug);
  if (!area) return <p className="ic-empty-hint">Unknown area.</p>;
  return <AreaHub area={area} />;
}

export const SituationHubView = () => hubFor("hub-situation");
export const PlansHubView = () => hubFor("hub-plans");
export const OperationsHubView = () => hubFor("hub-operations");
export const PeopleHubView = () => hubFor("hub-people");
export const CommsHubView = () => hubFor("hub-comms");
export const RecordsHubView = () => hubFor("hub-records");
