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

export type Personnel = {
  id: string;
  name: string;
  role: string;
  online: boolean;
};

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

export type LogEntry = {
  id: string;
  message: string;
  tags: string[];
  author: string;
  createdAt: string;
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
  folderId: string | null;
  content: string;
  status: "draft" | "published";
  pdfUrl: string | null;
  inIap: boolean;
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
};

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
};

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
};

export type Shelter = {
  id: string;
  name: string;
  status: ShelterStatus;
  capacity: number;
  occupancy: number;
};

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
};

import type { SupplyRoute } from "@/lib/maps/routing-types";

export type {
  RouteScenario,
  RouteVariant,
  RouteWaypoint,
  SupplyRoute,
  SupplyRouteStatus,
} from "@/lib/maps/routing-types";

export type IncidentSettings = {
  timezone: string;
  defaultActivationLevel: ActivationLevel;
  enablePublicPortal: boolean;
};

export type IncidentState = {
  situation: Situation;
  personnel: Personnel[];
  roleGroups: RoleGroup[];
  logs: LogEntry[];
  audit: AuditEntry[];
  forms: IcsFormRecord[];
  taskLists: TaskList[];
  damages: DamageRecord[];
  residents: Resident[];
  residentAreas: ResidentArea[];
  resourceRequests: ResourceRequest[];
  roadDamages: RoadDamage[];
  shelters: Shelter[];
  utilities: UtilityRow[];
  library: LibraryItem[];
  mapAnnotations: MapAnnotation[];
  supplyRoutes: SupplyRoute[];
  calendarEvents: CalendarEvent[];
  operationalPeriods: OperationalPeriod[];
  statusBoards: StatusBoard[];
  contactGroups: ContactGroup[];
  notifications: NotificationRecord[];
  settings: IncidentSettings;
};
