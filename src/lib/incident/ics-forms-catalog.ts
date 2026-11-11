/**
 * Official NIMS ICS forms catalog (FEMA EMI).
 * Source: https://training.fema.gov/icsresource/icsforms.aspx
 * Booklet: NIMS ICS Forms Booklet (FEMA 502-2), v3
 */

import { newId, nowIso } from "./id";
import type { IcsFormRecord } from "./types";

export const FEMA_ICS_FORMS_INDEX_URL =
  "https://training.fema.gov/icsresource/icsforms.aspx";

export const FEMA_ICS_BOOKLET_URL =
  "https://training.fema.gov/EMIWeb/IS/ICSResource/assets/ICS%20Forms/NIMS%20ICS%20Forms%20Booklet%20(v3).pdf";

const FEMA_PDF_BASE =
  "https://training.fema.gov/EMIWeb/IS/ICSResource/assets/ICS%20Forms/";

function femaPdf(fileName: string) {
  return FEMA_PDF_BASE + encodeURIComponent(fileName);
}

export type IcsFormCategory =
  | "iap"
  | "planning"
  | "operations"
  | "logistics"
  | "communications"
  | "safety"
  | "resources"
  | "demobilization"
  | "other";

export type IcsFormFieldType = "text" | "textarea" | "datetime";

export type IcsFormField = {
  id: string;
  label: string;
  type: IcsFormFieldType;
  placeholder?: string;
  rows?: number;
};

export type IcsFormSection = {
  id: string;
  title: string;
  fields: IcsFormField[];
};

export type IcsFormTemplate = {
  id: string;
  number: string;
  title: string;
  version: string;
  category: IcsFormCategory;
  inIap: boolean;
  preparedBy: string;
  pdfUrl: string;
  description: string;
  sections: IcsFormSection[];
};

export const ICS_FORM_CATEGORY_LABELS: Record<IcsFormCategory, string> = {
  iap: "Incident Action Plan (IAP) package",
  planning: "Planning",
  operations: "Operations",
  logistics: "Logistics",
  communications: "Communications",
  safety: "Safety",
  resources: "Resources & status",
  demobilization: "Demobilization",
  other: "Other",
};

const hdr = (n: number, title: string, v: string) =>
  femaPdf(`ICS Form ${n}, ${title} (${v}).pdf`);

const f = (
  id: string,
  label: string,
  type: IcsFormFieldType = "text",
  opts?: Partial<IcsFormField>,
): IcsFormField => ({ id, label, type, ...opts });

const sec = (id: string, title: string, fields: IcsFormField[]): IcsFormSection => ({
  id,
  title,
  fields,
});

/** Shared blocks used across multiple forms */
const INCIDENT_HEADER: IcsFormField[] = [
  f("incidentName", "1. Incident Name"),
  f("incidentNumber", "2. Incident Number"),
  f("dateTime", "3. Date/Time Initiated", "datetime"),
  f("operationalPeriod", "4. Operational Period (date/time from – to)", "textarea", {
    rows: 2,
  }),
];

export const ICS_FORM_TEMPLATES: IcsFormTemplate[] = [
  {
    id: "ICS-201",
    number: "201",
    title: "Incident Briefing",
    version: "v3",
    category: "iap",
    inIap: false,
    preparedBy: "Initial Incident Commander",
    pdfUrl: hdr(201, "Incident Briefing", "v3"),
    description:
      "Provides the IC with basic incident information and resource status for the current operational period.",
    sections: [
      sec("map", "1. Map/Sketch (reference)", [
        f("mapSketch", "Map or sketch notes", "textarea", { rows: 3 }),
      ]),
      sec("situation", "2. Situation Summary", [
        f("currentSituation", "Current situation", "textarea", { rows: 4 }),
        f("healthSafety", "Health and safety briefing", "textarea", { rows: 3 }),
      ]),
      sec("objectives", "3. Current & Planned Objectives", [
        f("objectives", "Objectives", "textarea", { rows: 4 }),
      ]),
      sec("prepared", "4. Prepared by", [
        f("preparedByName", "Name"),
        f("preparedByPosition", "Position/Title"),
        f("preparedByDateTime", "Date/Time", "datetime"),
      ]),
    ],
  },
  {
    id: "ICS-202",
    number: "202",
    title: "Incident Objectives",
    version: "v3.1",
    category: "iap",
    inIap: true,
    preparedBy: "Planning Section Chief",
    pdfUrl: hdr(202, "Incident Objectives", "v3.1"),
    description: "States incident objectives for the operational period; IAP cover sheet.",
    sections: [
      sec("header", "Incident / operational period", [...INCIDENT_HEADER]),
      sec("objectives", "5. Incident Objectives", [
        f("objectives", "Objectives (numbered)", "textarea", { rows: 6 }),
      ]),
      sec("command", "6. Command emphasis", [
        f("commandEmphasis", "General command emphasis", "textarea", { rows: 3 }),
        f("safetyMessage", "Overall safety message", "textarea", { rows: 3 }),
      ]),
      sec("weather", "7. Weather forecast", [
        f("weatherForecast", "Weather forecast (time period)", "textarea", { rows: 3 }),
      ]),
    ],
  },
  {
    id: "ICS-203",
    number: "203",
    title: "Organization Assignment List",
    version: "v3",
    category: "iap",
    inIap: true,
    preparedBy: "Resources Unit Leader",
    pdfUrl: hdr(203, "Organization Assignment List", "v3"),
    description: "Lists organizational chart positions and personnel assigned.",
    sections: [
      sec("header", "Incident / operational period", [...INCIDENT_HEADER]),
      sec("assignments", "5. Organization assignments", [
        f(
          "assignments",
          "Position — Name — Contact (one per line)",
          "textarea",
          { rows: 12, placeholder: "Incident Commander — Jane Doe — radio 1" },
        ),
      ]),
    ],
  },
  {
    id: "ICS-204",
    number: "204",
    title: "Assignment List",
    version: "v3.1",
    category: "iap",
    inIap: true,
    preparedBy: "Resources Unit Leader / Operations Section Chief",
    pdfUrl: hdr(204, "Assignment List", "v3.1"),
    description: "Assignment list by division/group with resources and reporting locations.",
    sections: [
      sec("header", "Incident / operational period", [...INCIDENT_HEADER]),
      sec("branch", "5. Branch / division / group", [
        f("branchDivisionGroup", "Branch / Division / Group"),
        f("operationsLocation", "Operations personnel location"),
      ]),
      sec("assignments", "6. Assignments", [
        f(
          "assignmentTable",
          "Resource — Leader — # persons — Reporting location — Requested arrival",
          "textarea",
          { rows: 10 },
        ),
      ]),
      sec("special", "7. Special instructions", [
        f("specialInstructions", "Special instructions", "textarea", { rows: 4 }),
      ]),
    ],
  },
  {
    id: "ICS-205",
    number: "205",
    title: "Incident Radio Communications Plan",
    version: "v3.1",
    category: "iap",
    inIap: true,
    preparedBy: "Communications Unit Leader",
    pdfUrl: hdr(205, "Incident Radio Communications Plan", "v3.1"),
    description: "Radio frequencies and talkgroup assignments for the operational period.",
    sections: [
      sec("header", "Incident / operational period", [...INCIDENT_HEADER]),
      sec("comms", "5. Communications table", [
        f(
          "radioTable",
          "Zone — Channel — Function — Assigned — Remarks",
          "textarea",
          { rows: 10 },
        ),
      ]),
      sec("prepared", "6. Prepared by", [
        f("preparedByName", "Name"),
        f("preparedByPosition", "Position/Title"),
      ]),
    ],
  },
  {
    id: "ICS-205A",
    number: "205A",
    title: "Communications List",
    version: "v3",
    category: "iap",
    inIap: true,
    preparedBy: "Communications Unit Leader",
    pdfUrl: femaPdf("ICS Form 205A, Communications List (v3).pdf"),
    description: "IAP attachment listing key contacts and communications methods.",
    sections: [
      sec("header", "Incident / operational period", [...INCIDENT_HEADER]),
      sec("contacts", "5. Communications list", [
        f(
          "contactList",
          "Position — Name — Phone/Radio/Email",
          "textarea",
          { rows: 12 },
        ),
      ]),
    ],
  },
  {
    id: "ICS-206",
    number: "206",
    title: "Medical Plan",
    version: "v3",
    category: "iap",
    inIap: true,
    preparedBy: "Medical Unit Leader (reviewed by Safety Officer)",
    pdfUrl: hdr(206, "Medical Plan", "v3"),
    description: "Medical plan for the incident including aid stations and transportation.",
    sections: [
      sec("header", "Incident / operational period", [...INCIDENT_HEADER]),
      sec("medical", "5. Medical plan", [
        f("medicalAidStations", "Medical aid stations", "textarea", { rows: 4 }),
        f("ambulance", "Ambulance services", "textarea", { rows: 3 }),
        f("hospitals", "Hospitals", "textarea", { rows: 4 }),
        f("specialProcedures", "Special medical emergency procedures", "textarea", { rows: 4 }),
      ]),
    ],
  },
  {
    id: "ICS-207",
    number: "207",
    title: "Incident Organization Chart",
    version: "v3",
    category: "iap",
    inIap: true,
    preparedBy: "Resources Unit Leader",
    pdfUrl: hdr(207, "Incident Organization Chart", "v3"),
    description: "Visual organization chart for the incident command structure.",
    sections: [
      sec("header", "Incident / operational period", [...INCIDENT_HEADER]),
      sec("chart", "5. Organization chart", [
        f(
          "orgChartNotes",
          "Org chart notes or paste structure (IC → sections → branches)",
          "textarea",
          { rows: 12 },
        ),
      ]),
    ],
  },
  {
    id: "ICS-208",
    number: "208",
    title: "Safety Message/Plan",
    version: "v3.1",
    category: "iap",
    inIap: true,
    preparedBy: "Safety Officer",
    pdfUrl: femaPdf("ICS Form 208, Safety Message-Plan (v3.1).pdf"),
    description: "Safety message and plan for the operational period.",
    sections: [
      sec("header", "Incident / operational period", [...INCIDENT_HEADER]),
      sec("safety", "5. Safety message / plan", [
        f("safetyMessage", "Safety message", "textarea", { rows: 6 }),
        f("hazards", "Site safety hazards", "textarea", { rows: 4 }),
      ]),
    ],
  },
  {
    id: "ICS-208HM",
    number: "208HM",
    title: "Site Safety and Control Plan (HazMat)",
    version: "v3",
    category: "safety",
    inIap: false,
    preparedBy: "Safety Officer",
    pdfUrl: femaPdf("ICS Form 208HM, Site Safety and Control Plan (v3).pdf"),
    description: "HazMat site safety and control plan.",
    sections: [
      sec("site", "Site safety and control", [
        f("entryPlan", "Entry plan", "textarea", { rows: 4 }),
        f("decon", "Decontamination", "textarea", { rows: 3 }),
        f("zones", "Control zones", "textarea", { rows: 4 }),
      ]),
    ],
  },
  {
    id: "ICS-209",
    number: "209",
    title: "Incident Status Summary",
    version: "v3",
    category: "operations",
    inIap: false,
    preparedBy: "Situation Unit Leader",
    pdfUrl: hdr(209, "Incident Status Summary", "v3"),
    description: "Summary of incident status for agency administrators and cooperating agencies.",
    sections: [
      sec("summary", "1. Incident status summary", [
        f("incidentName", "Incident name"),
        f("incidentNumber", "Incident number"),
        f("situationSummary", "Situation summary", "textarea", { rows: 5 }),
        f("resourceSummary", "Resources summary", "textarea", { rows: 4 }),
        f("damageAssessment", "Damage assessment", "textarea", { rows: 3 }),
      ]),
    ],
  },
  {
    id: "ICS-210",
    number: "210",
    title: "Resource Status Change",
    version: "v3",
    category: "resources",
    inIap: false,
    preparedBy: "Communications Unit Leader",
    pdfUrl: hdr(210, "Resource Status Change", "v3"),
    description: "Documents changes in resource status.",
    sections: [
      sec("changes", "Resource status changes", [
        f(
          "statusChanges",
          "Resource ID — Status change — Date/Time — Notes",
          "textarea",
          { rows: 10 },
        ),
      ]),
    ],
  },
  {
    id: "ICS-211",
    number: "211",
    title: "Incident Check-In List",
    version: "v3.1",
    category: "resources",
    inIap: false,
    preparedBy: "Resources Unit / Check-In Recorder",
    pdfUrl: hdr(211, "Incident Check-In List", "v3.1"),
    description: "Check-in of personnel and equipment arriving at the incident.",
    sections: [
      sec("checkin", "Check-in list", [
        f(
          "checkInList",
          "Order — Name — ICS position — Agency — Check-in location — Time",
          "textarea",
          { rows: 12 },
        ),
      ]),
    ],
  },
  {
    id: "ICS-213",
    number: "213",
    title: "General Message",
    version: "v3",
    category: "communications",
    inIap: false,
    preparedBy: "Any message originator",
    pdfUrl: hdr(213, "General Message", "v3"),
    description: "General message form (3-part).",
    sections: [
      sec("message", "Message", [
        f("to", "To"),
        f("from", "From"),
        f("subject", "Subject"),
        f("message", "Message", "textarea", { rows: 8 }),
      ]),
    ],
  },
  {
    id: "ICS-213RR",
    number: "213RR",
    title: "Resource Request Message",
    version: "v3",
    category: "logistics",
    inIap: false,
    preparedBy: "Any message originator",
    pdfUrl: femaPdf("ICS Form 213RR, Resource Request Message (v3).pdf"),
    description: "Resource request message (ICS 213 RR).",
    sections: [
      sec("request", "Resource request", [
        f("resourceRequested", "Resource requested"),
        f("quantity", "Quantity"),
        f("priority", "Priority"),
        f("deliveryLocation", "Delivery location"),
        f("neededDateTime", "Date/time needed", "datetime"),
        f("justification", "Justification", "textarea", { rows: 4 }),
      ]),
    ],
  },
  {
    id: "ICS-214",
    number: "214",
    title: "Activity Log",
    version: "v3.1",
    category: "operations",
    inIap: false,
    preparedBy: "All sections and units",
    pdfUrl: hdr(214, "Activity Log", "v3.1"),
    description: "Unit/individual activity log for the operational period.",
    sections: [
      sec("header", "Unit information", [
        f("unitName", "Unit name"),
        f("unitLeader", "Unit leader"),
        f("operationalPeriod", "Operational period"),
      ]),
      sec("log", "Activity log", [
        f(
          "activities",
          "Date/Time — Activity (chronological)",
          "textarea",
          { rows: 14 },
        ),
      ]),
    ],
  },
  {
    id: "ICS-215",
    number: "215",
    title: "Operational Planning Worksheet",
    version: "v3",
    category: "planning",
    inIap: false,
    preparedBy: "Operations Section Chief",
    pdfUrl: hdr(215, "Operational Planning Worksheet", "v3"),
    description: "Captures tactical operations assignments for the planning process.",
    sections: [
      sec("worksheet", "Operational planning worksheet", [
        f(
          "tacticsTable",
          "Division/Group — Assignment — Resources — Work location — Notes",
          "textarea",
          { rows: 12 },
        ),
      ]),
    ],
  },
  {
    id: "ICS-215A",
    number: "215A",
    title: "Incident Action Plan Safety Analysis",
    version: "v3",
    category: "safety",
    inIap: true,
    preparedBy: "Safety Officer",
    pdfUrl: femaPdf("ICS Form 215A, Incident Action Plan Safety Analysis (v3).pdf"),
    description: "Safety analysis to accompany the IAP.",
    sections: [
      sec("analysis", "Safety analysis", [
        f(
          "hazardAnalysis",
          "Assignment — Hazards — Mitigation — Approved by",
          "textarea",
          { rows: 12 },
        ),
      ]),
    ],
  },
  {
    id: "ICS-217A",
    number: "217A",
    title: "Comm Resource Availability Worksheet",
    version: "v3",
    category: "communications",
    inIap: false,
    preparedBy: "Communications Unit Leader",
    pdfUrl: femaPdf("ICS Form 217A, Comm Resource Avail Worksheet (v3).pdf"),
    description: "Communications resource availability worksheet.",
    sections: [
      sec("avail", "Resource availability", [
        f("commResources", "Communications resources available", "textarea", { rows: 10 }),
      ]),
    ],
  },
  {
    id: "ICS-218",
    number: "218",
    title: "Support Vehicle/Equipment Inventory",
    version: "v3",
    category: "logistics",
    inIap: false,
    preparedBy: "Ground Support Unit",
    pdfUrl: hdr(218, "Support Vehicle-Equipment Inventory", "v3"),
    description: "Inventory of support vehicles and equipment.",
    sections: [
      sec("inventory", "Vehicle/equipment inventory", [
        f(
          "inventory",
          "Vehicle/Equipment — Type — Agency — Status",
          "textarea",
          { rows: 12 },
        ),
      ]),
    ],
  },
  {
    id: "ICS-219",
    number: "219",
    title: "Resource Status Card (T-Card) System",
    version: "v3",
    category: "resources",
    inIap: false,
    preparedBy: "Resources Unit",
    pdfUrl: hdr(219, "T-Card Instructions", "v3"),
    description:
      "T-Card resource tracking (ICS 219-1 through 219-10 color cards). Use official PDF set for print.",
    sections: [
      sec("tcards", "T-Card tracking", [
        f(
          "tcardNotes",
          "Resource ID — Card color/type — Status — Location — Notes",
          "textarea",
          { rows: 10 },
        ),
      ]),
    ],
  },
  {
    id: "ICS-220",
    number: "220",
    title: "Air Operations Summary Worksheet",
    version: "v3",
    category: "operations",
    inIap: false,
    preparedBy: "Operations Section Chief or Air Branch Director",
    pdfUrl: hdr(220, "Air Operations Summary", "v3"),
    description: "Summary of air operations for the operational period.",
    sections: [
      sec("air", "Air operations", [
        f("airSummary", "Air operations summary", "textarea", { rows: 10 }),
      ]),
    ],
  },
  {
    id: "ICS-221",
    number: "221",
    title: "Demobilization Check-Out",
    version: "v3.1",
    category: "demobilization",
    inIap: false,
    preparedBy: "Demobilization Unit Leader",
    pdfUrl: femaPdf("ics form 221, demobilization check-out (v3.1).pdf"),
    description: "Demobilization check-out for resources leaving the incident.",
    sections: [
      sec("demob", "Demobilization", [
        f(
          "demobList",
          "Resource — Agency — Departure date/time — Destination — Notes",
          "textarea",
          { rows: 10 },
        ),
      ]),
    ],
  },
  {
    id: "ICS-225",
    number: "225",
    title: "Incident Personnel Performance Rating",
    version: "v3",
    category: "other",
    inIap: false,
    preparedBy: "Supervisor at the incident",
    pdfUrl: hdr(225, "Incident Personnel Performance Rating", "v3"),
    description: "Performance rating for incident personnel.",
    sections: [
      sec("rating", "Performance rating", [
        f("employeeName", "Employee name"),
        f("position", "Position"),
        f("rating", "Rating / comments", "textarea", { rows: 6 }),
      ]),
    ],
  },
  {
    id: "ICS-260",
    number: "260",
    title: "Resource Order",
    version: "current",
    category: "logistics",
    inIap: false,
    preparedBy: "Ordering manager",
    pdfUrl: femaPdf("ICS Form 260, Resource Order.pdf"),
    description: "Official resource order form.",
    sections: [
      sec("order", "Resource order", [
        f("resourceDescription", "Resource description", "textarea", { rows: 3 }),
        f("quantity", "Quantity"),
        f("reportingLocation", "Reporting location"),
        f("neededDateTime", "Date/time needed", "datetime"),
      ]),
    ],
  },
];

const templateById = new Map(ICS_FORM_TEMPLATES.map((t) => [t.id, t]));

export function getIcsFormTemplate(templateId: string): IcsFormTemplate | undefined {
  return templateById.get(templateId);
}

export function getIcsFormTemplatesGrouped(): {
  category: IcsFormCategory;
  label: string;
  templates: IcsFormTemplate[];
}[] {
  const order: IcsFormCategory[] = [
    "iap",
    "planning",
    "operations",
    "logistics",
    "communications",
    "safety",
    "resources",
    "demobilization",
    "other",
  ];
  return order
    .map((category) => ({
      category,
      label: ICS_FORM_CATEGORY_LABELS[category],
      templates: ICS_FORM_TEMPLATES.filter((t) => t.category === category),
    }))
    .filter((g) => g.templates.length > 0);
}

export function searchIcsFormTemplates(query: string): IcsFormTemplate[] {
  const q = query.trim().toLowerCase();
  if (!q) return ICS_FORM_TEMPLATES;
  return ICS_FORM_TEMPLATES.filter(
    (t) =>
      t.id.toLowerCase().includes(q) ||
      t.number.toLowerCase().includes(q) ||
      t.title.toLowerCase().includes(q) ||
      t.preparedBy.toLowerCase().includes(q) ||
      t.description.toLowerCase().includes(q),
  );
}

export type IcsFormSaveMeta = {
  savedAt: string;
  savedBy: string;
  savedByEmail?: string | null;
  /** Client-generated PDF filename on last save. */
  pdfFileName?: string | null;
};

export type IcsFormContentPayload = {
  v: 1;
  templateId: string;
  fields: Record<string, string>;
  /** Field ids in official FEMA section order for export/replay. */
  fieldOrder?: string[];
  meta?: IcsFormSaveMeta;
};

export function buildFieldOrder(template: IcsFormTemplate): string[] {
  const order: string[] = [];
  for (const section of template.sections) {
    for (const field of section.fields) {
      order.push(field.id);
    }
  }
  return order;
}

export function buildInitialFormContent(template: IcsFormTemplate): string {
  const fields: Record<string, string> = {};
  for (const section of template.sections) {
    for (const field of section.fields) {
      fields[field.id] = "";
    }
  }
  const payload: IcsFormContentPayload = {
    v: 1,
    templateId: template.id,
    fields,
  };
  return JSON.stringify(payload, null, 2);
}

export function parseFormContent(
  content: string,
  templateId: string | null,
): {
  fields: Record<string, string>;
  isStructured: boolean;
  fieldOrder?: string[];
  meta?: IcsFormSaveMeta;
} {
  if (!content.trim()) {
    return { fields: {}, isStructured: false };
  }
  try {
    const parsed = JSON.parse(content) as IcsFormContentPayload;
    if (parsed?.v === 1 && parsed.fields && typeof parsed.fields === "object") {
      return {
        fields: parsed.fields,
        isStructured: true,
        fieldOrder: parsed.fieldOrder,
        meta: parsed.meta,
      };
    }
  } catch {
    /* legacy plain text */
  }
  return {
    fields: { _legacyNotes: content },
    isStructured: false,
  };
}

export function serializeFormFields(
  templateId: string,
  fields: Record<string, string>,
  options?: {
    fieldOrder?: string[];
    meta?: IcsFormSaveMeta;
  },
): string {
  const template = getIcsFormTemplate(templateId);
  const payload: IcsFormContentPayload = {
    v: 1,
    templateId,
    fields,
    fieldOrder: options?.fieldOrder ?? (template ? buildFieldOrder(template) : undefined),
    meta: options?.meta,
  };
  return JSON.stringify(payload, null, 2);
}

export function displayFormName(template: IcsFormTemplate): string {
  return `ICS ${template.number} — ${template.title}`;
}

/**
 * ICS-202 attachment checkbox id → the ICS form template it calls for.
 * Attachments that aren't standalone ICS forms (map/chart, weather) are omitted.
 */
export const ICS202_ATTACHMENT_FORM: Record<string, string> = {
  iap203: "ICS-203",
  iap204: "ICS-204",
  iap205: "ICS-205",
  iap205a: "ICS-205A",
  iap206: "ICS-206",
  iap207: "ICS-207",
  iap208: "ICS-208",
};

export type RequiredForm = { templateId: string; label: string };

/**
 * Derive the forms the IAP requires by reading the ticked attachment checkboxes
 * on any ICS-202 present in the incident. De-duplicates across multiple 202s.
 */
export function getRequiredFormsFromIcs202(
  forms: { templateId: string | null; content: string }[],
): RequiredForm[] {
  const required = new Map<string, RequiredForm>();
  for (const form of forms) {
    if (form.templateId !== "ICS-202") continue;
    const { fields } = parseFormContent(form.content, form.templateId);
    for (const [attId, templateId] of Object.entries(ICS202_ATTACHMENT_FORM)) {
      if (fields[attId] === "1" && !required.has(templateId)) {
        const template = getIcsFormTemplate(templateId);
        required.set(templateId, {
          templateId,
          label: template ? displayFormName(template) : templateId,
        });
      }
    }
  }
  return [...required.values()];
}

/**
 * Build a fresh draft form record for a template, optionally prefilling common
 * header fields from the incident situation. Shared by the store's `addForm`
 * action and by event seeding (so seeded and manually-added forms are identical).
 */
export function buildFormRecord(
  templateId: string,
  prefill?: {
    incidentName?: string;
    dateTime?: string;
    operationalPeriod?: string;
    objectives?: string;
    currentSituation?: string;
  },
): IcsFormRecord | null {
  const template = getIcsFormTemplate(templateId);
  if (!template) return null;
  let content = buildInitialFormContent(template);
  if (prefill) {
    try {
      const payload = JSON.parse(content) as { fields: Record<string, string> };
      const f = payload.fields;
      if (f.incidentName !== undefined && prefill.incidentName) f.incidentName = prefill.incidentName;
      if (f.dateTime !== undefined && prefill.dateTime) f.dateTime = prefill.dateTime;
      if (f.operationalPeriod !== undefined && prefill.operationalPeriod)
        f.operationalPeriod = prefill.operationalPeriod;
      if (f.objectives !== undefined && prefill.objectives) f.objectives = prefill.objectives;
      if (f.currentSituation !== undefined && prefill.currentSituation)
        f.currentSituation = prefill.currentSituation;
      content = JSON.stringify({ ...payload, v: 1, templateId: template.id }, null, 2);
    } catch {
      /* keep default scaffold */
    }
  }
  return {
    id: newId(),
    templateId: template.id,
    formNumber: template.number,
    name: displayFormName(template),
    officialTitle: template.title,
    formType: "ICS",
    modifiedAt: nowIso(),
    createdAt: nowIso(),
    createdBy: null,
    savedAt: null,
    filledBy: null,
    folderId: null,
    content,
    status: "draft",
    pdfUrl: template.pdfUrl,
    inIap: template.inIap,
  };
}
