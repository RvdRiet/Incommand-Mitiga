"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

import {
  buildInitialFormContent,
  displayFormName,
  getIcsFormTemplate,
} from "./ics-forms-catalog";
import { createDefaultContactGroups, createDefaultStatusBoard } from "./d4h-defaults";
import { getPlayTemplate } from "./plays-catalog";
import { createInitialIncidentState, defaultSituation } from "./initial-state";
import { newId, nowIso } from "./id";
import type {
  ActivationLevel,
  AuditEntry,
  CalendarEvent,
  ContactGroup,
  DamageRecord,
  IcsFormRecord,
  IncidentSettings,
  IncidentState,
  LibraryItem,
  LogEntry,
  MapAnnotation,
  SupplyRoute,
  NotificationRecord,
  OperationalPeriod,
  Personnel,
  Resident,
  ResidentArea,
  ResourceRequest,
  RoadDamage,
  RoleRow,
  Shelter,
  Situation,
  StatusBoard,
  StatusBoardItem,
  TaskChecklistItem,
  TaskItem,
  TaskList,
  UtilityRow,
} from "./types";

function audit(actor: string, action: string): AuditEntry {
  return { id: newId(), actor, action, createdAt: nowIso() };
}

const incidentPersistMerge = (
  persisted: unknown,
  current: IncidentState,
): IncidentState => {
  const p = persisted as Partial<IncidentState>;
  return {
    ...current,
    ...p,
    situation: {
      ...current.situation,
      ...(p.situation ?? {}),
    },
    settings: {
      ...current.settings,
      ...(p.settings ?? {}),
    },
    roleGroups: Array.isArray(p.roleGroups) ? p.roleGroups : current.roleGroups,
    calendarEvents: Array.isArray(p.calendarEvents) ? p.calendarEvents : [],
    operationalPeriods: Array.isArray(p.operationalPeriods) ? p.operationalPeriods : [],
    statusBoards: Array.isArray(p.statusBoards) && p.statusBoards.length > 0
      ? p.statusBoards
      : [createDefaultStatusBoard()],
    contactGroups:
      Array.isArray(p.contactGroups) && p.contactGroups.length > 0
        ? p.contactGroups
        : Array.isArray(current.contactGroups) && current.contactGroups.length > 0
          ? current.contactGroups
          : createDefaultContactGroups(),
    notifications: Array.isArray(p.notifications) ? p.notifications : [],
    supplyRoutes: Array.isArray(p.supplyRoutes) ? p.supplyRoutes : [],
    taskLists: Array.isArray(p.taskLists)
      ? p.taskLists.map((list) => ({
          ...list,
          items: list.items.map((item) => ({
            ...item,
            checklist: item.checklist ?? [],
            priority: item.priority ?? "normal",
          })),
        }))
      : current.taskLists,
    forms: Array.isArray(p.forms)
      ? p.forms.map((f) => ({
          ...f,
          templateId: f.templateId ?? null,
          formNumber: f.formNumber ?? "",
          officialTitle: f.officialTitle ?? f.name ?? "",
          content: f.content ?? "",
          status: f.status ?? "draft",
          pdfUrl: f.pdfUrl ?? null,
          inIap: f.inIap ?? false,
        }))
      : current.forms,
    utilities: Array.isArray(p.utilities)
      ? p.utilities.map((u) => ({
          ...u,
          city: u.city ?? "",
        }))
      : current.utilities,
    residentAreas: Array.isArray(p.residentAreas) ? p.residentAreas : current.residentAreas,
    residents: Array.isArray(p.residents)
      ? p.residents.map((r) => ({
          ...r,
          residentAreaId: r.residentAreaId ?? null,
        }))
      : current.residents,
  };
};

type IncidentActions = {
  updateSituation: (patch: Partial<Situation>) => void;
  setActivationLevel: (level: ActivationLevel) => void;

  addPersonnel: () => string;
  updatePersonnel: (id: string, patch: Partial<Personnel>) => void;
  removePersonnel: (id: string) => void;

  addRole: (groupId: string) => void;
  updateRole: (groupId: string, roleId: string, patch: Partial<RoleRow>) => void;
  removeRole: (groupId: string, roleId: string) => void;
  assignPersonnelToRole: (groupId: string, roleId: string, personnelId: string | null) => void;

  addLog: (message: string, tags?: string[], author?: string) => void;

  addForm: (templateId: string) => string | null;
  updateForm: (id: string, patch: Partial<IcsFormRecord>) => void;
  removeForm: (id: string) => void;

  addTaskList: () => void;
  updateTaskList: (listId: string, patch: Partial<Pick<TaskList, "name">>) => void;
  removeTaskList: (listId: string) => void;
  addTaskItem: (listId: string) => void;
  updateTaskItem: (listId: string, itemId: string, patch: Partial<TaskItem>) => void;

  addDamage: () => void;
  updateDamage: (id: string, patch: Partial<DamageRecord>) => void;
  removeDamage: (id: string) => void;

  addResident: () => void;
  updateResident: (id: string, patch: Partial<Resident>) => void;
  removeResident: (id: string) => void;

  addResidentArea: () => string;
  updateResidentArea: (id: string, patch: Partial<ResidentArea>) => void;
  removeResidentArea: (id: string) => void;

  addResourceRequest: () => void;
  updateResourceRequest: (id: string, patch: Partial<ResourceRequest>) => void;
  removeResourceRequest: (id: string) => void;

  addRoadDamage: () => void;
  updateRoadDamage: (id: string, patch: Partial<RoadDamage>) => void;
  removeRoadDamage: (id: string) => void;

  addShelter: () => void;
  updateShelter: (id: string, patch: Partial<Shelter>) => void;
  removeShelter: (id: string) => void;

  addUtilityRow: () => void;
  updateUtilityRow: (id: string, patch: Partial<UtilityRow>) => void;
  removeUtilityRow: (id: string) => void;

  addLibraryItem: () => void;
  updateLibraryItem: (id: string, patch: Partial<LibraryItem>) => void;
  removeLibraryItem: (id: string) => void;

  addMapAnnotation: (
    partial?: Partial<Omit<MapAnnotation, "id">> & { name?: string },
  ) => string;
  updateMapAnnotation: (id: string, patch: Partial<MapAnnotation>) => void;
  removeMapAnnotation: (id: string) => void;

  addSupplyRoute: (
    partial?: Partial<Omit<SupplyRoute, "id" | "createdAt" | "updatedAt">>,
  ) => string;
  updateSupplyRoute: (id: string, patch: Partial<SupplyRoute>) => void;
  removeSupplyRoute: (id: string) => void;
  selectSupplyRouteVariant: (routeId: string, variantId: string | null) => void;
  setSupplyRouteStatus: (routeId: string, status: SupplyRoute["status"]) => void;

  addCalendarEvent: (partial?: Partial<CalendarEvent>) => string;
  updateCalendarEvent: (id: string, patch: Partial<CalendarEvent>) => void;
  removeCalendarEvent: (id: string) => void;

  addOperationalPeriod: () => string;
  updateOperationalPeriod: (id: string, patch: Partial<OperationalPeriod>) => void;
  removeOperationalPeriod: (id: string) => void;

  updateSettings: (patch: Partial<IncidentSettings>) => void;

  addStatusBoard: () => string;
  updateStatusBoard: (id: string, patch: Partial<Pick<StatusBoard, "name">>) => void;
  removeStatusBoard: (id: string) => void;
  addStatusBoardItem: (boardId: string, columnId: string) => void;
  updateStatusBoardItem: (
    boardId: string,
    itemId: string,
    patch: Partial<StatusBoardItem>,
  ) => void;
  removeStatusBoardItem: (boardId: string, itemId: string) => void;
  moveStatusBoardItem: (boardId: string, itemId: string, columnId: string) => void;

  addContactGroup: () => void;
  updateContactGroup: (id: string, patch: Partial<ContactGroup>) => void;
  removeContactGroup: (id: string) => void;

  queueNotification: (draft: Omit<NotificationRecord, "id" | "createdAt" | "status">) => void;
  markNotificationSent: (id: string) => void;
  removeNotification: (id: string) => void;

  startPlay: (playId: string) => boolean;
  addTaskChecklistItem: (listId: string, itemId: string, label?: string) => void;
  toggleTaskChecklistItem: (listId: string, itemId: string, checkId: string) => void;
  removeTaskChecklistItem: (listId: string, itemId: string, checkId: string) => void;

  resetIncident: () => void;
};

export type IncidentStore = IncidentState & IncidentActions;

/** Per-event incident store (persisted separately per event id). */
export function createIncidentStore(eventId: string) {
  return create<IncidentStore>()(
    persist(
      (set, get) => ({
        ...createInitialIncidentState(),

      updateSituation: (patch) => {
        set((s) => ({
          situation: { ...s.situation, ...patch },
          audit: [...s.audit, audit("System", `Situation updated: ${Object.keys(patch).join(", ")}`)],
        }));
      },

      setActivationLevel: (level) => {
        get().updateSituation({ activationLevel: level });
        set((s) => ({
          audit: [...s.audit, audit("System", `Activation level set to ${level}`)],
        }));
      },

      addPersonnel: () => {
        const id = newId();
        set((s) => ({
          personnel: [...s.personnel, { id, name: "New Personnel", role: "", online: false }],
          audit: [...s.audit, audit("System", "Personnel added")],
        }));
        return id;
      },

      updatePersonnel: (id, patch) => {
        set((s) => ({
          personnel: s.personnel.map((p) => (p.id === id ? { ...p, ...patch } : p)),
        }));
      },

      removePersonnel: (id) => {
        set((s) => ({
          personnel: s.personnel.filter((p) => p.id !== id),
          roleGroups: s.roleGroups.map((g) => ({
            ...g,
            roles: g.roles.map((r) =>
              r.personnelId === id ? { ...r, personnelId: null } : r,
            ),
          })),
        }));
      },

      addRole: (groupId) => {
        set((s) => ({
          roleGroups: s.roleGroups.map((g) =>
            g.id === groupId
              ? {
                  ...g,
                  roles: [...g.roles, { id: newId(), title: "New Role", personnelId: null }],
                }
              : g,
          ),
        }));
      },

      updateRole: (groupId, roleId, patch) => {
        set((s) => ({
          roleGroups: s.roleGroups.map((g) =>
            g.id === groupId
              ? {
                  ...g,
                  roles: g.roles.map((r) => (r.id === roleId ? { ...r, ...patch } : r)),
                }
              : g,
          ),
        }));
      },

      removeRole: (groupId, roleId) => {
        set((s) => ({
          roleGroups: s.roleGroups.map((g) =>
            g.id === groupId
              ? { ...g, roles: g.roles.filter((r) => r.id !== roleId) }
              : g,
          ),
        }));
      },

      assignPersonnelToRole: (groupId, roleId, personnelId) => {
        get().updateRole(groupId, roleId, { personnelId });
      },

      addLog: (message, tags = [], author = "Operator") => {
        if (!message.trim()) return;
        const entry: LogEntry = {
          id: newId(),
          message: message.trim(),
          tags,
          author,
          createdAt: nowIso(),
        };
        set((s) => ({
          logs: [entry, ...s.logs],
          audit: [...s.audit, audit(author, `Log: ${message.slice(0, 80)}`)],
        }));
      },

      addForm: (templateId) => {
        const template = getIcsFormTemplate(templateId);
        if (!template) return null;
        const id = newId();
        const situation = get().situation;
        let content = buildInitialFormContent(template);
        try {
          const payload = JSON.parse(content) as { fields: Record<string, string> };
          if (payload.fields.incidentName !== undefined && situation.name) {
            payload.fields.incidentName = situation.name;
          }
          if (payload.fields.dateTime !== undefined && situation.startDate) {
            payload.fields.dateTime = situation.startDate;
          }
          if (payload.fields.operationalPeriod !== undefined && situation.startDate) {
            payload.fields.operationalPeriod = situation.startDate;
          }
          if (payload.fields.objectives !== undefined && situation.objectives) {
            payload.fields.objectives = situation.objectives;
          }
          if (payload.fields.currentSituation !== undefined && situation.summary) {
            payload.fields.currentSituation = situation.summary;
          }
          content = JSON.stringify({ ...payload, v: 1, templateId: template.id }, null, 2);
        } catch {
          /* keep default scaffold */
        }
        const record: IcsFormRecord = {
          id,
          templateId: template.id,
          formNumber: template.number,
          name: displayFormName(template),
          officialTitle: template.title,
          formType: "ICS",
          modifiedAt: nowIso(),
          folderId: null,
          content,
          status: "draft",
          pdfUrl: template.pdfUrl,
          inIap: template.inIap,
        };
        set((s) => ({
          forms: [...s.forms, record],
          audit: [...s.audit, audit("System", `Form created: ${record.name}`)],
        }));
        return id;
      },

      updateForm: (id, patch) => {
        set((s) => ({
          forms: s.forms.map((f) =>
            f.id === id ? { ...f, ...patch, modifiedAt: nowIso() } : f,
          ),
        }));
      },

      removeForm: (id) => {
        set((s) => ({ forms: s.forms.filter((f) => f.id !== id) }));
      },

      addTaskList: () => {
        set((s) => ({
          taskLists: [
            ...s.taskLists,
            { id: newId(), name: "New task list", items: [] },
          ],
        }));
      },

      updateTaskList: (listId, patch) => {
        set((s) => ({
          taskLists: s.taskLists.map((l) => (l.id === listId ? { ...l, ...patch } : l)),
        }));
      },

      removeTaskList: (listId) => {
        set((s) => ({ taskLists: s.taskLists.filter((l) => l.id !== listId) }));
      },

      addTaskItem: (listId) => {
        set((s) => ({
          taskLists: s.taskLists.map((l) =>
            l.id === listId
              ? {
                  ...l,
                  items: [
                    ...l.items,
                    {
                      id: newId(),
                      title: "New task",
                      status: "not_started",
                      priority: "normal",
                      checklist: [],
                    },
                  ],
                }
              : l,
          ),
        }));
      },

      updateTaskItem: (listId, itemId, patch) => {
        set((s) => ({
          taskLists: s.taskLists.map((l) =>
            l.id === listId
              ? {
                  ...l,
                  items: l.items.map((i) => (i.id === itemId ? { ...i, ...patch } : i)),
                }
              : l,
          ),
        }));
      },

      addDamage: () => {
        const id = newId();
        set((s) => ({
          damages: [
            ...s.damages,
            {
              id,
              name: "New Damage Assessment",
              description: "",
              estimatedCost: 0,
              status: "assessing",
            },
          ],
        }));
        return id;
      },

      updateDamage: (id, patch) => {
        set((s) => ({
          damages: s.damages.map((d) => (d.id === id ? { ...d, ...patch } : d)),
        }));
      },

      removeDamage: (id) => {
        set((s) => ({ damages: s.damages.filter((d) => d.id !== id) }));
      },

      addResident: () => {
        set((s) => ({
          residents: [
            ...s.residents,
            {
              id: newId(),
              name: "New Resident",
              phone: "",
              shelterId: null,
              residentAreaId: null,
            },
          ],
        }));
      },

      updateResident: (id, patch) => {
        set((s) => ({
          residents: s.residents.map((r) => (r.id === id ? { ...r, ...patch } : r)),
        }));
      },

      removeResident: (id) => {
        set((s) => ({ residents: s.residents.filter((r) => r.id !== id) }));
      },

      addResidentArea: () => {
        const id = newId();
        set((s) => ({
          residentAreas: [
            ...s.residentAreas,
            {
              id,
              city: "",
              municipality: "",
              province: "",
              censusPopulation: 0,
              censusPlaceId: null,
              estimatedAffected: 0,
              trackedResidents: 0,
              notes: "",
            },
          ],
        }));
        return id;
      },

      updateResidentArea: (id, patch) => {
        set((s) => ({
          residentAreas: s.residentAreas.map((a) => (a.id === id ? { ...a, ...patch } : a)),
        }));
      },

      removeResidentArea: (id) => {
        set((s) => ({
          residentAreas: s.residentAreas.filter((a) => a.id !== id),
          residents: s.residents.map((r) =>
            r.residentAreaId === id ? { ...r, residentAreaId: null } : r,
          ),
        }));
      },

      addResourceRequest: () => {
        set((s) => ({
          resourceRequests: [
            ...s.resourceRequests,
            {
              id: newId(),
              resource: "New Resource Request",
              status: "requested",
              costPerHour: 0,
              hours: 0,
            },
          ],
        }));
      },

      updateResourceRequest: (id, patch) => {
        set((s) => ({
          resourceRequests: s.resourceRequests.map((r) =>
            r.id === id ? { ...r, ...patch } : r,
          ),
        }));
      },

      removeResourceRequest: (id) => {
        set((s) => ({
          resourceRequests: s.resourceRequests.filter((r) => r.id !== id),
        }));
      },

      addRoadDamage: () => {
        set((s) => ({
          roadDamages: [
            ...s.roadDamages,
            {
              id: newId(),
              roadName: "",
              fromIntersection: "",
              toIntersection: "",
              status: "closed",
              municipality: "",
              location: "",
              reason: "",
              timeReported: nowIso(),
            },
          ],
        }));
      },

      updateRoadDamage: (id, patch) => {
        set((s) => ({
          roadDamages: s.roadDamages.map((r) => (r.id === id ? { ...r, ...patch } : r)),
        }));
      },

      removeRoadDamage: (id) => {
        set((s) => ({ roadDamages: s.roadDamages.filter((r) => r.id !== id) }));
      },

      addShelter: () => {
        set((s) => ({
          shelters: [
            ...s.shelters,
            {
              id: newId(),
              name: "New Shelter",
              status: "open",
              capacity: 0,
              occupancy: 0,
            },
          ],
        }));
      },

      updateShelter: (id, patch) => {
        set((s) => ({
          shelters: s.shelters.map((sh) => (sh.id === id ? { ...sh, ...patch } : sh)),
        }));
      },

      removeShelter: (id) => {
        set((s) => ({ shelters: s.shelters.filter((sh) => sh.id !== id) }));
      },

      addUtilityRow: () => {
        set((s) => ({
          utilities: [
            ...s.utilities,
            {
              id: newId(),
              city: "",
              municipality: "",
              hazardRegion: "",
              tier: "",
              status: "",
              customersWithoutPower: 0,
              totalCustomers: 0,
            },
          ],
        }));
      },

      updateUtilityRow: (id, patch) => {
        set((s) => ({
          utilities: s.utilities.map((u) => (u.id === id ? { ...u, ...patch } : u)),
        }));
      },

      removeUtilityRow: (id) => {
        set((s) => ({ utilities: s.utilities.filter((u) => u.id !== id) }));
      },

      addLibraryItem: () => {
        set((s) => ({
          library: [
            ...s.library,
            { id: newId(), name: "New document", modifiedAt: nowIso() },
          ],
        }));
      },

      updateLibraryItem: (id, patch) => {
        set((s) => ({
          library: s.library.map((l) => (l.id === id ? { ...l, ...patch } : l)),
        }));
      },

      removeLibraryItem: (id) => {
        set((s) => ({ library: s.library.filter((l) => l.id !== id) }));
      },

      addMapAnnotation: (partial) => {
        const id = newId();
        const kind = partial?.kind ?? "point";
        const name =
          partial?.name ??
          (kind === "polygon"
            ? "Planning area"
            : kind === "circle"
              ? "Radius zone"
              : "New annotation");
        set((s) => ({
          mapAnnotations: [
            ...s.mapAnnotations,
            {
              id,
              name,
              kind,
              geojson: partial?.geojson ?? { type: "FeatureCollection", features: [] },
              radiusMeters: partial?.radiusMeters,
            },
          ],
        }));
        return id;
      },

      updateMapAnnotation: (id, patch) => {
        set((s) => ({
          mapAnnotations: s.mapAnnotations.map((a) =>
            a.id === id ? { ...a, ...patch } : a,
          ),
        }));
      },

      removeMapAnnotation: (id) => {
        set((s) => ({
          mapAnnotations: s.mapAnnotations.filter((a) => a.id !== id),
        }));
      },

      addSupplyRoute: (partial) => {
        const id = newId();
        const t = nowIso();
        set((s) => {
          const route: SupplyRoute = {
            id,
            name: partial?.name ?? `Route ${s.supplyRoutes.length + 1}`,
            purpose: partial?.purpose ?? "Supply / logistics",
            origin: partial?.origin ?? { lat: 0, lng: 0, label: "" },
            destination: partial?.destination ?? { lat: 0, lng: 0, label: "" },
            midJourneyOrigin: partial?.midJourneyOrigin ?? null,
            viaPoints: partial?.viaPoints ?? [],
            avoidAnnotationId: partial?.avoidAnnotationId ?? null,
            variants: partial?.variants ?? [],
            selectedVariantId: partial?.selectedVariantId ?? null,
            status: partial?.status ?? "planning",
            briefingNotes: partial?.briefingNotes ?? "",
            createdAt: t,
            updatedAt: t,
          };
          return { supplyRoutes: [...s.supplyRoutes, route] };
        });
        return id;
      },

      updateSupplyRoute: (id, patch) => {
        set((s) => ({
          supplyRoutes: s.supplyRoutes.map((r) =>
            r.id === id ? { ...r, ...patch, updatedAt: nowIso() } : r,
          ),
        }));
      },

      removeSupplyRoute: (id) => {
        set((s) => ({ supplyRoutes: s.supplyRoutes.filter((r) => r.id !== id) }));
      },

      selectSupplyRouteVariant: (routeId, variantId) => {
        set((s) => ({
          supplyRoutes: s.supplyRoutes.map((r) =>
            r.id === routeId
              ? { ...r, selectedVariantId: variantId, updatedAt: nowIso() }
              : r,
          ),
        }));
      },

      setSupplyRouteStatus: (routeId, status) => {
        set((s) => ({
          supplyRoutes: s.supplyRoutes.map((r) =>
            r.id === routeId ? { ...r, status, updatedAt: nowIso() } : r,
          ),
        }));
      },

      addCalendarEvent: (partial) => {
        const id = newId();
        const start = partial?.startAt ?? nowIso().slice(0, 16);
        const event: CalendarEvent = {
          id,
          title: partial?.title ?? "New event",
          description: partial?.description ?? "",
          location: partial?.location ?? "",
          type: partial?.type ?? "planning",
          startAt: start,
          endAt: partial?.endAt ?? start,
          allDay: partial?.allDay ?? false,
          operationalPeriodId: partial?.operationalPeriodId ?? null,
        };
        set((s) => ({
          calendarEvents: [...s.calendarEvents, event],
          audit: [...s.audit, audit("System", `Calendar event added: ${event.title}`)],
        }));
        return id;
      },

      updateCalendarEvent: (id, patch) => {
        set((s) => ({
          calendarEvents: s.calendarEvents.map((e) => (e.id === id ? { ...e, ...patch } : e)),
        }));
      },

      removeCalendarEvent: (id) => {
        set((s) => ({
          calendarEvents: s.calendarEvents.filter((e) => e.id !== id),
        }));
      },

      addOperationalPeriod: () => {
        const id = newId();
        const num = get().operationalPeriods.length + 1;
        const startsAt = nowIso().slice(0, 16);
        const endsAt = new Date(Date.now() + 12 * 3600000).toISOString().slice(0, 16);
        const op: OperationalPeriod = {
          id,
          name: `Operational Period ${num}`,
          number: num,
          startsAt,
          endsAt,
          objectives: "",
        };
        const calEvent: CalendarEvent = {
          id: newId(),
          title: op.name,
          description: "",
          location: "",
          type: "operational_period",
          startAt: startsAt,
          endAt: endsAt,
          allDay: false,
          operationalPeriodId: id,
        };
        set((s) => ({
          operationalPeriods: [...s.operationalPeriods, op],
          calendarEvents: [...s.calendarEvents, calEvent],
          audit: [...s.audit, audit("System", `Operational period ${num} opened`)],
        }));
        return id;
      },

      updateOperationalPeriod: (id, patch) => {
        set((s) => {
          const operationalPeriods = s.operationalPeriods.map((op) =>
            op.id === id ? { ...op, ...patch } : op,
          );
          const updated = operationalPeriods.find((op) => op.id === id);
          return {
            operationalPeriods,
            calendarEvents: s.calendarEvents.map((e) => {
              if (e.operationalPeriodId !== id || !updated) return e;
              return {
                ...e,
                title: updated.name,
                startAt: updated.startsAt,
                endAt: updated.endsAt,
                description: updated.objectives,
              };
            }),
          };
        });
      },

      removeOperationalPeriod: (id) => {
        set((s) => ({
          operationalPeriods: s.operationalPeriods.filter((op) => op.id !== id),
          calendarEvents: s.calendarEvents.filter(
            (e) => e.operationalPeriodId !== id,
          ),
        }));
      },

      updateSettings: (patch) => {
        set((s) => ({ settings: { ...s.settings, ...patch } }));
      },

      addStatusBoard: () => {
        const board = createDefaultStatusBoard("Status board");
        set((s) => ({ statusBoards: [...s.statusBoards, board] }));
        return board.id;
      },

      updateStatusBoard: (id, patch) => {
        set((s) => ({
          statusBoards: s.statusBoards.map((b) => (b.id === id ? { ...b, ...patch } : b)),
        }));
      },

      removeStatusBoard: (id) => {
        set((s) => ({
          statusBoards: s.statusBoards.filter((b) => b.id !== id),
        }));
      },

      addStatusBoardItem: (boardId, columnId) => {
        const item: StatusBoardItem = {
          id: newId(),
          columnId,
          title: "New item",
          notes: "",
          assignee: "",
          priority: "normal",
          updatedAt: nowIso(),
        };
        set((s) => ({
          statusBoards: s.statusBoards.map((b) =>
            b.id === boardId ? { ...b, items: [...b.items, item] } : b,
          ),
        }));
      },

      updateStatusBoardItem: (boardId, itemId, patch) => {
        set((s) => ({
          statusBoards: s.statusBoards.map((b) =>
            b.id === boardId
              ? {
                  ...b,
                  items: b.items.map((i) =>
                    i.id === itemId
                      ? { ...i, ...patch, updatedAt: nowIso() }
                      : i,
                  ),
                }
              : b,
          ),
        }));
      },

      removeStatusBoardItem: (boardId, itemId) => {
        set((s) => ({
          statusBoards: s.statusBoards.map((b) =>
            b.id === boardId
              ? { ...b, items: b.items.filter((i) => i.id !== itemId) }
              : b,
          ),
        }));
      },

      moveStatusBoardItem: (boardId, itemId, columnId) => {
        get().updateStatusBoardItem(boardId, itemId, { columnId });
      },

      addContactGroup: () => {
        set((s) => ({
          contactGroups: [
            ...s.contactGroups,
            {
              id: newId(),
              name: "New group",
              description: "",
              members: "",
            },
          ],
        }));
      },

      updateContactGroup: (id, patch) => {
        set((s) => ({
          contactGroups: s.contactGroups.map((g) =>
            g.id === id ? { ...g, ...patch } : g,
          ),
        }));
      },

      removeContactGroup: (id) => {
        set((s) => ({
          contactGroups: s.contactGroups.filter((g) => g.id !== id),
        }));
      },

      queueNotification: (draft) => {
        const record: NotificationRecord = {
          id: newId(),
          ...draft,
          status: "queued",
          createdAt: nowIso(),
        };
        set((s) => ({
          notifications: [record, ...s.notifications],
          audit: [
            ...s.audit,
            audit("System", `Notification queued: ${draft.subject}`),
          ],
        }));
        setTimeout(() => get().markNotificationSent(record.id), 800);
      },

      markNotificationSent: (id) => {
        set((s) => ({
          notifications: s.notifications.map((n) =>
            n.id === id ? { ...n, status: "sent" } : n,
          ),
        }));
      },

      removeNotification: (id) => {
        set((s) => ({
          notifications: s.notifications.filter((n) => n.id !== id),
        }));
      },

      startPlay: (playId) => {
        const play = getPlayTemplate(playId);
        if (!play) return false;
        const listId = newId();
        const items = play.steps.map((step, i) => ({
          id: newId(),
          title: `${i + 1}. ${step.title}`,
          status: "not_started" as const,
          priority: "normal" as const,
          checklist: [
            {
              id: newId(),
              label: step.description,
              done: false,
            } satisfies TaskChecklistItem,
          ],
        }));
        set((s) => ({
          taskLists: [
            ...s.taskLists,
            { id: listId, name: `Play: ${play.name}`, items },
          ],
          logs: [
            {
              id: newId(),
              message: `Play started: ${play.name} (${play.steps.length} steps)`,
              tags: ["play", play.category.toLowerCase()],
              author: "System",
              createdAt: nowIso(),
            },
            ...s.logs,
          ],
          audit: [...s.audit, audit("System", `Play applied: ${play.name}`)],
        }));
        return true;
      },

      addTaskChecklistItem: (listId, itemId, label = "Checklist item") => {
        set((s) => ({
          taskLists: s.taskLists.map((l) =>
            l.id === listId
              ? {
                  ...l,
                  items: l.items.map((item) =>
                    item.id === itemId
                      ? {
                          ...item,
                          checklist: [
                            ...(item.checklist ?? []),
                            { id: newId(), label, done: false },
                          ],
                        }
                      : item,
                  ),
                }
              : l,
          ),
        }));
      },

      toggleTaskChecklistItem: (listId, itemId, checkId) => {
        set((s) => ({
          taskLists: s.taskLists.map((l) =>
            l.id === listId
              ? {
                  ...l,
                  items: l.items.map((item) =>
                    item.id === itemId
                      ? {
                          ...item,
                          checklist: (item.checklist ?? []).map((c) =>
                            c.id === checkId ? { ...c, done: !c.done } : c,
                          ),
                        }
                      : item,
                  ),
                }
              : l,
          ),
        }));
      },

      removeTaskChecklistItem: (listId, itemId, checkId) => {
        set((s) => ({
          taskLists: s.taskLists.map((l) =>
            l.id === listId
              ? {
                  ...l,
                  items: l.items.map((item) =>
                    item.id === itemId
                      ? {
                          ...item,
                          checklist: (item.checklist ?? []).filter(
                            (c) => c.id !== checkId,
                          ),
                        }
                      : item,
                  ),
                }
              : l,
          ),
        }));
      },

      resetIncident: () => {
        const name = get().situation.name;
        set({ ...createInitialIncidentState(name) });
      },
    }),
      {
        name: `mitiga-incident-${eventId}`,
        merge: (persisted, current) => ({
          ...(current as IncidentStore),
          ...incidentPersistMerge(persisted, current as IncidentState),
        }),
      },
    ),
  );
}
