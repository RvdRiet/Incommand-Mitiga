import type { FeatureCollection } from "geojson";

export type ActivationLevel = "planning" | "activated" | "closed";

export type CalendarEventType =
  | "planning"
  | "briefing"
  | "operational_period"
  | "exercise"
  | "meeting"
  | "deployment"
  | "other";

export type CalendarEvent = {
  id: string;
  title: string;
  description: string;
  location: string;
  type: CalendarEventType;
  startAt: string;
  endAt: string;
  allDay: boolean;
  operationalPeriodId: string | null;
};

export type OperationalPeriod = {
  id: string;
  name: string;
  number: number;
  startsAt: string;
  endsAt: string;
  objectives: string;
};

export type ResourceRequestStatus = "requested" | "enroute" | "assigned" | "ready";
export type RoadStatus = "closed" | "one_lane" | "open";
export type TaskItemStatus = "not_started" | "in_progress" | "complete" | "canceled";
export type DamageStatus = "minor" | "severe" | "assessing";
export type ShelterStatus = "open" | "full" | "closed";

export type Situation = {
  name: string;
  startDate: string;
  endDate: string;
  location: string;
  lat: number | null;
  lng: number | null;
  summary: string;
  objectives: string;
  keyContacts: string;
  activationLevel: ActivationLevel;
};

/** Optional map location, used to plot a record on the Common Operating Picture. */
export type GeoLocated = {
  lat?: number | null;
  lng?: number | null;
};

export type Personnel = {
  id: string;
  name: string;
  role: string;
  online: boolean;
  /**
   * Live link to the org roster person (`org_personnel.id`) this record was added from.
   * When set, the in-event person view resolves photo, qualifications and recent shifts
   * live from the org stores, so hub edits show through. Absent for manually-added people.
   */
  orgPersonId?: string;
} & GeoLocated;

export type RoleRow = {
  id: string;
  title: string;
  personnelId: string | null;
};

export type RoleGroup = {
  id: string;
  name: string;
  roles: RoleRow[];
};

export type ActivityLogKind = "user" | "ui" | "navigation" | "data" | "system";

export type LogEntry = {
  id: string;
  message: string;
  tags: string[];
  author: string;
  createdAt: string;
  kind?: ActivityLogKind;
  target?: string;
  detail?: string;
};

export type AuditEntry = {
  id: string;
  action: string;
  actor: string;
  createdAt: string;
};

export type IcsFormRecord = {
  id: string;
  templateId: string | null;
  formNumber: string;
  name: string;
  officialTitle: string;
  formType: string;
  modifiedAt: string;
  /** When the form was first created. */
  createdAt: string;
  /** Display name of the person whose account created the form. */
  createdBy: string | null;
  /** Last explicit save (ICS structured payload + metadata). */
  savedAt: string | null;
  /** Display name of the person who last saved/edited the form. */
  filledBy: string | null;
  folderId: string | null;
  content: string;
  status: "draft" | "published";
  pdfUrl: string | null;
  inIap: boolean;
};

/**
 * User-designed forms (the drag-and-drop builder) — surveys, checklists, and
 * free-form data-capture forms. Distinct from the fixed FEMA `IcsFormRecord`
 * layouts: these carry an arbitrary field schema the operator assembles.
 */
export type CustomFormFieldType =
  | "text"
  | "textarea"
  | "number"
  | "date"
  | "checkbox" // single yes/no toggle
  | "select" // dropdown, one choice
  | "radio" // multiple choice, one selection
  | "checklist" // multiple options, many selectable
  | "section" // section heading (layout only)
  | "paragraph"; // static instructional text (layout only)

export type CustomFormField = {
  id: string;
  type: CustomFormFieldType;
  label: string;
  placeholder?: string;
  helpText?: string;
  required?: boolean;
  /** For select / radio / checklist. */
  options?: string[];
};

/** A submitted set of answers for a custom form. */
export type CustomFormResponse = {
  id: string;
  submittedAt: string;
  submittedBy: string;
  /** Keyed by field id → the answer (string, multi-select array, or boolean). */
  values: Record<string, string | string[] | boolean>;
};

export type CustomForm = {
  id: string;
  name: string;
  description?: string;
  kind: "survey" | "checklist" | "form";
  status: "draft" | "published";
  fields: CustomFormField[];
  responses: CustomFormResponse[];
  createdAt: string;
  modifiedAt: string;
};

export type TaskList = {
  id: string;
  name: string;
  items: TaskItem[];
};

export type TaskChecklistItem = {
  id: string;
  label: string;
  done: boolean;
};

export type TaskItem = {
  id: string;
  title: string;
  status: TaskItemStatus;
  assignee?: string;
  priority?: "low" | "normal" | "high" | "urgent";
  checklist?: TaskChecklistItem[];
};

export type StatusBoardColumn = {
  id: string;
  title: string;
  color?: string;
};

export type StatusBoardItem = {
  id: string;
  columnId: string;
  title: string;
  notes: string;
  assignee: string;
  priority: "low" | "normal" | "high" | "urgent";
  updatedAt: string;
};

export type StatusBoard = {
  id: string;
  name: string;
  columns: StatusBoardColumn[];
  items: StatusBoardItem[];
};

export type ContactGroup = {
  id: string;
  name: string;
  description: string;
  members: string;
};

export type NotificationRecord = {
  id: string;
  subject: string;
  body: string;
  groupIds: string[];
  channels: ("email" | "sms")[];
  status: "draft" | "queued" | "sent";
  createdAt: string;
};

export type DamageRecord = {
  id: string;
  name: string;
  description: string;
  estimatedCost: number;
  status: DamageStatus;
} & GeoLocated;

export type Resident = {
  id: string;
  name: string;
  phone: string;
  shelterId: string | null;
  /** Links to a city/area row when registered from that area. */
  residentAreaId: string | null;
};

/** City or municipality population context (Stats SA Census 2022 baseline). */
export type ResidentArea = {
  id: string;
  city: string;
  municipality: string;
  province: string;
  censusPopulation: number;
  censusPlaceId: string | null;
  estimatedAffected: number;
  trackedResidents: number;
  notes: string;
};

export type ResourceRequest = {
  id: string;
  resource: string;
  status: ResourceRequestStatus;
  costPerHour: number;
  hours: number;
} & GeoLocated;

export type RoadDamage = {
  id: string;
  roadName: string;
  fromIntersection: string;
  toIntersection: string;
  status: RoadStatus;
  municipality: string;
  location: string;
  reason: string;
  timeReported: string;
} & GeoLocated;

export type Shelter = {
  id: string;
  name: string;
  status: ShelterStatus;
  capacity: number;
  occupancy: number;
} & GeoLocated;

export type UtilityRow = {
  id: string;
  /** City or metro name used for sorting and dashboard grouping. */
  city: string;
  municipality: string;
  hazardRegion: string;
  tier: string;
  status: string;
  customersWithoutPower: number;
  totalCustomers: number;
};

export type OutageType = "electricity" | "water";
export type OutageStatus = "reported" | "confirmed" | "restoring" | "resolved";

/** An electricity or water outage plotted on the Outage Map as a point + affected-area radius. */
export type OutageRecord = {
  id: string;
  type: OutageType;
  title: string;
  lat: number;
  lng: number;
  /** Affected-area radius in metres (rendered as a shaded circle). */
  radiusM: number;
  status: OutageStatus;
  cause?: string;
  /** People / customers affected. */
  affected?: number;
  /** ISO — when the outage began. */
  startedAt?: string;
  /** ISO — estimated time of restoration. */
  etaAt?: string;
  note?: string;
};

export type LibraryItem = {
  id: string;
  name: string;
  modifiedAt: string;
  category?: "document" | "play" | "template" | "media" | "other";
  url?: string;
};

export type MapAnnotation = {
  id: string;
  name: string;
  kind: "point" | "line" | "polygon" | "circle";
  geojson: FeatureCollection;
  /** Set when kind is circle (meters). */
  radiusMeters?: number;
  /** Hex fill/stroke colour for this shape. Auto-assigned distinct on create. */
  color?: string;
};

import type { SupplyRoute } from "@/lib/maps/routing-types";

export type {
  RouteScenario,
  RouteVariant,
  RouteWaypoint,
  SupplyRoute,
  SupplyRouteStatus,
} from "@/lib/maps/routing-types";

/* -------------------------------------------------------------------------- */
/* Bodycam / live comms (RFC-003) — Channels, Field Units, Distress            */
/* -------------------------------------------------------------------------- */

/** Half-duplex tactical push-to-talk vs full-duplex command net. */
export type ChannelMode = "ptt" | "open_net";

/**
 * A live comms channel — the digital, operational form of an ICS-205 row.
 * This is CONFIG (persisted). Live state (who's connected/talking, stream up)
 * arrives separately from the media backend and is never persisted here.
 */
export type Channel = {
  id: string;
  name: string;
  function: string;
  mode: ChannelMode;
  color: string;
  /** Stable link back to the ICS-205 form + row it was generated from. */
  sourceFormId: string | null;
  sourceRowId: string | null;
  /** Media/voice bindings, provisioned by the backend when the channel activates. */
  sipRoom: string | null;
  videoRoom: string | null;
  pageEnabled: boolean;
  /** Radio metadata carried through for the RoIP gateway side. */
  radio?: { rxFreq?: string; txFreq?: string; mode?: string };
};

export type FieldUnitStatus = "available" | "assigned" | "offline";

/** A field unit (bodycam + responder). Links to a Personnel record for RBAC. */
export type FieldUnit = {
  id: string;
  callsign: string;
  personnelId: string | null;
  deviceId: string | null;
  /** The channel this unit talks on. */
  channelId: string | null;
  status: FieldUnitStatus;
} & GeoLocated;

export type DistressKind = "sos" | "man_down" | "duress";
export type DistressStatus = "active" | "acknowledged" | "resolved" | "false_alarm";

/** A distress signal from the field. A permanent fact — persisted for audit/legal. */
export type DistressEvent = {
  id: string;
  unitId: string;
  unitCallsign: string;
  channelId: string | null;
  kind: DistressKind;
  source: "manual" | "auto";
  lat: number | null;
  lng: number | null;
  triggeredAt: string;
  status: DistressStatus;
  ackBy?: string;
  ackAt?: string;
  resolvedAt?: string;
  /** Device went dark after firing — keep the alert up with last-known position. */
  signalLost?: boolean;
};

/** Per-recipient delivery state of a page (the acknowledged paging state machine). */
export type PageDeliveryStatus = "queued" | "delivered" | "ack";

export type PageRecipient = {
  unitId: string;
  callsign: string;
  status: PageDeliveryStatus;
  updatedAt: string;
};

/** A page sent to the units on a channel. A persisted fact (audit); ACKs come from devices. */
export type PageMessage = {
  id: string;
  channelId: string | null;
  channelName: string;
  body: string;
  sentBy: string;
  createdAt: string;
  recipients: PageRecipient[];
};

export type IncidentSettings = {
  timezone: string;
  defaultActivationLevel: ActivationLevel;
  enablePublicPortal: boolean;
  /** A bodycam with no telemetry check-in for this many seconds is shown as offline. */
  deviceOfflineAfterSec: number;
  /** Fatigue rules — a single continuous shift longer than this is flagged (hours). */
  maxShiftHours: number;
  /** Max on-duty hours allowed within any rolling 24-hour window. */
  maxOnDuty24h: number;
  /** Minimum rest required between shifts (hours). */
  minRestHours: number;
  /** Certifications expiring within this many days are flagged for renewal. */
  certReminderDays: number;
  /** Inventory items expiring or due for maintenance within this many days are flagged. */
  inventoryReminderDays: number;
};

/** A rostered shift: a person assigned on duty for a window, for fatigue tracking. */
export type Shift = {
  id: string;
  personnelId: string | null;
  role: string;
  startsAt: string;
  endsAt: string;
  note?: string;
};

/** A personnel certification / qualification with an optional expiry for renewal tracking. */
export type Certification = {
  id: string;
  personnelId: string | null;
  /** Certification / qualification name, e.g. "Advanced First Aid". */
  name: string;
  /** Competency level, e.g. "Level 3" / "Advanced" (free text). */
  level: string;
  /** Issuing body. */
  issuer: string;
  /** ISO date issued ("" if unknown). */
  issuedAt: string;
  /** ISO date it expires ("" = no expiry). */
  expiresAt: string;
  /** Certificate / registration number. */
  reference: string;
  note?: string;
};

/** Broad classes of stock so the register can be filtered and grouped. */
export type InventoryCategory =
  | "general"
  | "ppe"
  | "fire"
  | "first_aid"
  | "medical"
  | "rescue"
  | "relief"
  | "other";

/** Serviceability of a tracked item (mainly for gear/equipment). */
export type InventoryCondition = "serviceable" | "monitor" | "unserviceable";

/**
 * A stock line: consumable relief/first-aid supplies OR trackable gear (fire
 * extinguishers, PPE, rescue equipment). Expiry covers perishables; the maintenance
 * fields cover gear that needs periodic inspection/servicing. Any field can be blank
 * ("" / 0) when it does not apply to that item.
 */
export type InventoryItem = {
  id: string;
  name: string;
  category: InventoryCategory;
  /** Quantity on hand. */
  quantity: number;
  /** Unit of issue, e.g. "units", "boxes", "pairs", "kg". */
  unit: string;
  /** Reorder / par level — quantity at or below this is flagged low. 0 = untracked. */
  minQuantity: number;
  /** Where it is kept: store room, cache, vehicle, etc. */
  location: string;
  /** Asset tag / serial for individually tracked gear ("" for bulk consumables). */
  serial: string;
  condition: InventoryCondition;
  /** ISO date the item expires ("" = non-perishable). */
  expiryDate: string;
  /** ISO date of the last inspection/service ("" = none recorded). */
  lastInspection: string;
  /** Days between required inspections (0 = no scheduled maintenance). */
  inspectionIntervalDays: number;
  notes: string;
};

export type IncidentState = {
  situation: Situation;
  personnel: Personnel[];
  roleGroups: RoleGroup[];
  logs: LogEntry[];
  audit: AuditEntry[];
  forms: IcsFormRecord[];
  customForms: CustomForm[];
  taskLists: TaskList[];
  damages: DamageRecord[];
  residents: Resident[];
  residentAreas: ResidentArea[];
  resourceRequests: ResourceRequest[];
  roadDamages: RoadDamage[];
  shelters: Shelter[];
  utilities: UtilityRow[];
  outages: OutageRecord[];
  library: LibraryItem[];
  mapAnnotations: MapAnnotation[];
  supplyRoutes: SupplyRoute[];
  calendarEvents: CalendarEvent[];
  operationalPeriods: OperationalPeriod[];
  statusBoards: StatusBoard[];
  contactGroups: ContactGroup[];
  notifications: NotificationRecord[];
  channels: Channel[];
  fieldUnits: FieldUnit[];
  distressEvents: DistressEvent[];
  pages: PageMessage[];
  shifts: Shift[];
  certifications: Certification[];
  inventory: InventoryItem[];
  settings: IncidentSettings;
};
