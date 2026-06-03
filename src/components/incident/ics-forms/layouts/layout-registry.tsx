import type { ComponentType } from "react";

import { ICS_FORM_SPECS } from "@/lib/incident/ics-form-specs";

import { FemaSpecRenderer } from "../FemaSpecRenderer";
import type { FemaLayoutProps } from "./ICS201";
import { ICS201Layout } from "./ICS201";
import { ICS202Layout } from "./ICS202";
import { ICS203Layout } from "./ICS203";
import { ICS204Layout } from "./ICS204";
import { ICS205Layout } from "./ICS205";
import { ICS213Layout } from "./ICS213";
import { ICS214Layout } from "./ICS214";

export type { FemaLayoutProps };

function specLayout(spec: (typeof ICS_FORM_SPECS)[string]): ComponentType<FemaLayoutProps> {
  return function SpecLayout({ fields, setField }) {
    return <FemaSpecRenderer spec={spec} fields={fields} setField={setField} />;
  };
}

const CUSTOM_LAYOUTS: Record<string, ComponentType<FemaLayoutProps>> = {
  "ICS-201": ICS201Layout,
  "ICS-202": ICS202Layout,
  "ICS-203": ICS203Layout,
  "ICS-204": ICS204Layout,
  "ICS-205": ICS205Layout,
  "ICS-213": ICS213Layout,
  "ICS-214": ICS214Layout,
};

const SPEC_LAYOUTS = Object.fromEntries(
  Object.entries(ICS_FORM_SPECS).map(([id, spec]) => [id, specLayout(spec)]),
) as Record<string, ComponentType<FemaLayoutProps>>;

const FEMA_LAYOUTS: Record<string, ComponentType<FemaLayoutProps>> = {
  ...SPEC_LAYOUTS,
  ...CUSTOM_LAYOUTS,
};

export function hasFemaLayout(templateId: string): boolean {
  return templateId in FEMA_LAYOUTS;
}

export function getFemaLayout(templateId: string): ComponentType<FemaLayoutProps> | undefined {
  return FEMA_LAYOUTS[templateId];
}
