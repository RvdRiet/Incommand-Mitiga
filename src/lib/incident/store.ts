"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

/**
 * localStorage, but a failed write (quota exceeded, or Safari private mode) is
 * swallowed instead of thrown. Without this, one oversized write — e.g. a large
 * embedded image — makes zustand's persist throw on EVERY subsequent save, which
 * cascades: nothing persists and the console fills with errors. The incident state
 * also syncs to the server (the real source of truth), so dropping a local cache
 * write is safe; the DB keeps the data and rehydrates it on reload.
 */
const noopStorage = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {},
};
const quotaSafeStorage = createJSONStorage(() => {
  if (typeof window === "undefined") return noopStorage;
  let warned = false;
  return {
    getItem: (key: string) => {
      try {
        return window.localStorage.getItem(key);
      } catch {
        return null; // private mode / blocked storage — hydrate from the server instead
      }
    },
    setItem: (key: string, value: string) => {
      try {
        window.localStorage.setItem(key, value);
      } catch (e) {
        if (!warned) {
          warned = true;
          console.warn(
            `[incident] local cache write skipped (${(e as Error)?.name ?? "error"}); state still syncs to the server.`,
          );
        }
      }
    },
    removeItem: (key: string) => {
      try {
        window.localStorage.removeItem(key);
      } catch {
        /* ignore */
      }
    },
  };
});

import { nextAnnotationColor } from "@/lib/maps/map-annotations";
import {
  buildFieldOrder,
  buildFormRecord,
  buildInitialFormContent,
  getIcsFormTemplate,
  parseFormContent,
  serializeFormFields,
} from "./ics-forms-catalog";
import { buildIcs209Fields } from "./ics-209";
import { createDefaultContactGroups, createDefaultStatusBoard } from "./d4h-defaults";
import { getPlayTemplate } from "./plays-catalog";
import { createInitialIncidentState, defaultSituation } from "./initial-state";
import {
  appendActivityLog,
  runWithoutStoreActivityLog,
} from "./activity-log";
import { newId, nowIso } from "./id";
import { channelsFromICS205, findICS205 } from "./comms";
import type {
  ActivationLevel,
  AuditEntry,
  CalendarEvent,
  Channel,
  ContactGroup,
  DamageRecord,
  DistressEvent,
  DistressKind,
  CustomForm,
  CustomFormField,
  CustomFormResponse,
  FieldUnit,
  PageMessage,
  PageRecipient,
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
  OutageRecord,
  Shift,
  Certification,
  InventoryItem,
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

/**
 * Upgrade a legacy ICS form so it renders the structured FEMA layout (and picks
 * up linked auto-population). Only EMPTY-content forms with a known templateId
 * are upgraded to the structured scaffold — forms holding real free text are left
 * exactly as they are, so no notes are ever reinterpreted or lost.
 */
const upgradeLegacyFormContent = (
  templateId: string | null,
  content: string,
): string => {
  if (!templateId || content.trim()) return content;
  const template = getIcsFormTemplate(templateId);
  return template ? buildInitialFormContent(template) : content;
};

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
    channels: Array.isArray(p.channels) ? p.channels : [],
    fieldUnits: Array.isArray(p.fieldUnits) ? p.fieldUnits : [],
    distressEvents: Array.isArray(p.distressEvents) ? p.distressEvents : [],
    pages: Array.isArray(p.pages) ? p.pages : [],
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
          content: upgradeLegacyFormContent(f.templateId ?? null, f.content ?? ""),
          status: f.status ?? "draft",
          pdfUrl: f.pdfUrl ?? null,
          inIap: f.inIap ?? false,
          createdAt: f.createdAt ?? f.modifiedAt ?? nowIso(),
          createdBy: f.createdBy ?? null,
          savedAt: f.savedAt ?? null,
          filledBy: f.filledBy ?? null,
        }))
      : current.forms,
    customForms: Array.isArray(p.customForms)
      ? p.customForms.map((f) => ({
          ...f,
          kind: f.kind ?? "form",
          status: f.status ?? "draft",
          fields: Array.isArray(f.fields) ? f.fields : [],
          responses: Array.isArray(f.responses) ? f.responses : [],
        }))
      : current.customForms,
    utilities: Array.isArray(p.utilities)
      ? p.utilities.map((u) => ({
          ...u,
          city: u.city ?? "",
        }))
      : current.utilities,
    outages: Array.isArray(p.outages) ? p.outages : [],
    shifts: Array.isArray(p.shifts) ? p.shifts : [],
    certifications: Array.isArray(p.certifications) ? p.certifications : [],
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

  addPersonnel: (partial?: { name?: string; role?: string; orgPersonId?: string }) => string;
  updatePersonnel: (id: string, patch: Partial<Personnel>) => void;
  removePersonnel: (id: string) => void;

  addRole: (groupId: string) => void;
  updateRole: (groupId: string, roleId: string, patch: Partial<RoleRow>) => void;
  removeRole: (groupId: string, roleId: string) => void;
  assignPersonnelToRole: (groupId: string, roleId: string, personnelId: string | null) => void;

  /**
   * Display name of the signed-in account, used as the author for every logged
   * action. Set from the session; "System" before a user is known. Not synced to
   * the DB (it's per-session), so it lives on the store, not IncidentState.
   */
  currentActor: string;
  setCurrentActor: (name: string) => void;
  addLog: (message: string, tags?: string[], author?: string) => void;
  recordActivity: (record: {
    message: string;
    tags?: string[];
    author?: string;
    kind?: import("./types").ActivityLogKind;
    target?: string;
    detail?: string;
  }) => void;

  addForm: (templateId: string, actor?: { name: string; email?: string | null }) => string | null;
  /** Re-synthesise an auto-populated form (ICS-209) from live incident data. */
  autoPopulateForm: (id: string) => boolean;
  updateForm: (id: string, patch: Partial<IcsFormRecord>) => void;
      saveForm: (
        id: string,
        actor: { name: string; email?: string | null },
        options?: { pdfFileName?: string | null },
      ) => boolean;
  removeForm: (id: string) => void;

  // Custom (drag-and-drop) forms, surveys, and checklists.
  addCustomForm: (kind?: CustomForm["kind"]) => string;
  updateCustomForm: (
    id: string,
    patch: Partial<Pick<CustomForm, "name" | "description" | "kind" | "status">>,
  ) => void;
  removeCustomForm: (id: string) => void;
  addCustomFormField: (
    formId: string,
    type: CustomFormField["type"],
    atIndex?: number,
  ) => string;
  updateCustomFormField: (
    formId: string,
    fieldId: string,
    patch: Partial<CustomFormField>,
  ) => void;
  removeCustomFormField: (formId: string, fieldId: string) => void;
  moveCustomFormField: (formId: string, fieldId: string, toIndex: number) => void;
  addCustomFormResponse: (formId: string, response: Omit<CustomFormResponse, "id">) => void;
  removeCustomFormResponse: (formId: string, responseId: string) => void;

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

  addRoadDamage: (patch?: Partial<RoadDamage>) => void;
  updateRoadDamage: (id: string, patch: Partial<RoadDamage>) => void;
  removeRoadDamage: (id: string) => void;

  addShelter: () => void;
  updateShelter: (id: string, patch: Partial<Shelter>) => void;
  removeShelter: (id: string) => void;

  addOutage: (partial?: Partial<OutageRecord>) => string;
  updateOutage: (id: string, patch: Partial<OutageRecord>) => void;
  removeOutage: (id: string) => void;

  addShift: (partial?: Partial<Shift>) => string;
  updateShift: (id: string, patch: Partial<Shift>) => void;
  removeShift: (id: string) => void;

  addCertification: (partial?: Partial<Certification>) => string;
  updateCertification: (id: string, patch: Partial<Certification>) => void;
  removeCertification: (id: string) => void;
  addInventoryItem: (partial?: Partial<InventoryItem>) => string;
  updateInventoryItem: (id: string, patch: Partial<InventoryItem>) => void;
  removeInventoryItem: (id: string) => void;

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

  // Live comms (RFC-003) — channels, field units, distress
  addChannel: () => string;
  updateChannel: (id: string, patch: Partial<Channel>) => void;
  removeChannel: (id: string) => void;
  /** Rebuild channels from the incident's ICS-205, keeping manual channels. Returns count synced. */
  syncChannelsFromICS205: () => number;

  addFieldUnit: (partial?: { id?: string; callsign?: string; deviceId?: string }) => string;
  updateFieldUnit: (id: string, patch: Partial<FieldUnit>) => void;
  removeFieldUnit: (id: string) => void;

  /** Send a page to every unit on a channel. Returns the page id (or null if channel gone). */
  sendPage: (channelId: string, body: string) => string | null;
  /** Backend/device callbacks that advance the acknowledged paging state machine. */
  markPageDelivered: (pageId: string, unitId: string) => void;
  markPageAck: (pageId: string, unitId: string) => void;
  raiseDistress: (
    unitId: string,
    kind: DistressKind,
    source?: "manual" | "auto",
    coords?: { lat: number; lng: number },
  ) => void;
  acknowledgeDistress: (id: string, by: string) => void;
  resolveDistress: (id: string, status: "resolved" | "false_alarm") => void;

  resetIncident: () => void;
};

export type IncidentStore = IncidentState & IncidentActions;

/** Friendly stage labels for the audit trail (matches the UI: Planning / Activated / Resolved). */
const STAGE_LABEL: Record<ActivationLevel, string> = {
  planning: "Planning",
  activated: "Activated",
  closed: "Resolved",
};

/** Per-event incident store (persisted separately per event id). */
export function createIncidentStore(eventId: string) {
  return create<IncidentStore>()(
    persist(
      (set, get) => ({
        ...createInitialIncidentState(),

      updateSituation: (patch) => {
        set((s) => ({
          situation: { ...s.situation, ...patch },
          audit: [...s.audit, audit(get().currentActor, `Situation updated: ${Object.keys(patch).join(", ")}`)],
        }));
      },

      setActivationLevel: (level) => {
        const prev = get().situation.activationLevel;
        if (prev === level) return;
        set((s) => ({
          situation: { ...s.situation, activationLevel: level },
          audit: [
            ...s.audit,
            audit("Command", `Incident stage changed: ${STAGE_LABEL[prev]} → ${STAGE_LABEL[level]}`),
          ],
        }));
      },

      addPersonnel: (partial) => {
        const id = newId();
        const name = partial?.name?.trim() || "New Personnel";
        set((s) => ({
          personnel: [
            ...s.personnel,
            {
              id,
              name,
              role: partial?.role?.trim() || "",
              online: false,
              orgPersonId: partial?.orgPersonId,
            },
          ],
          audit: [
            ...s.audit,
            audit(get().currentActor, partial?.name ? `Personnel added: ${name}` : "Personnel added"),
          ],
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

      currentActor: "System",
      setCurrentActor: (name) => {
        const trimmed = name.trim();
        if (trimmed && trimmed !== get().currentActor) set({ currentActor: trimmed });
      },

      addLog: (message, tags = [], author) => {
        if (!message.trim()) return;
        runWithoutStoreActivityLog(() => {
          get().recordActivity({
            message: message.trim(),
            tags: ["user", ...tags],
            author: author ?? get().currentActor,
            kind: "user",
          });
        });
      },

      recordActivity: (record) => {
        if (!record.message.trim()) return;
        runWithoutStoreActivityLog(() => {
          // Attribute to the signed-in account unless the caller named someone.
          appendActivityLog(set, { ...record, author: record.author ?? get().currentActor });
        });
      },

      addForm: (templateId, actor) => {
        const situation = get().situation;
        const record = buildFormRecord(templateId, {
          incidentName: situation.name,
          dateTime: situation.startDate,
          operationalPeriod: situation.startDate,
          objectives: situation.objectives,
          currentSituation: situation.summary,
        });
        if (!record) return null;
        // Register who created the form (the initiating account).
        if (actor?.name) record.createdBy = actor.name;
        // ICS-209 is a live status roll-up — seed its narrative from incident data so a
        // new one opens already filled instead of blank.
        if (templateId === "ICS-209") {
          const parsed = parseFormContent(record.content, templateId);
          const fields = { ...parsed.fields, ...buildIcs209Fields(get()) };
          const template = getIcsFormTemplate(templateId);
          record.content = serializeFormFields(templateId, fields, {
            fieldOrder: template ? buildFieldOrder(template) : undefined,
          });
        }
        set((s) => ({
          forms: [...s.forms, record],
          audit: [
            ...s.audit,
            audit(actor?.name ?? "System", `Form created: ${record.name}`),
          ],
        }));
        return record.id;
      },

      autoPopulateForm: (id) => {
        const form = get().forms.find((f) => f.id === id);
        if (!form || form.templateId !== "ICS-209") return false;
        const template = getIcsFormTemplate(form.templateId);
        if (!template) return false;
        const parsed = parseFormContent(form.content, form.templateId);
        // Merge derived fields over existing ones — hand-typed fields we don't derive
        // (e.g. incident number) survive; the narrative fields refresh to current data.
        const fields = { ...parsed.fields, ...buildIcs209Fields(get()) };
        const content = serializeFormFields(form.templateId, fields, {
          fieldOrder: buildFieldOrder(template),
          meta: parsed.meta,
        });
        set((s) => ({
          forms: s.forms.map((f) =>
            f.id === id ? { ...f, content, modifiedAt: nowIso() } : f,
          ),
          audit: [
            ...s.audit,
            audit(get().currentActor, `ICS-209 auto-populated from incident data`),
          ],
        }));
        return true;
      },

      updateForm: (id, patch) => {
        set((s) => ({
          forms: s.forms.map((f) =>
            f.id === id ? { ...f, ...patch, modifiedAt: nowIso() } : f,
          ),
        }));
      },

      saveForm: (id, actor, options) => {
        const form = get().forms.find((f) => f.id === id);
        if (!form?.templateId) return false;
        const template = getIcsFormTemplate(form.templateId);
        if (!template) return false;

        const { fields } = parseFormContent(form.content, form.templateId);
        const savedAt = nowIso();
        const content = serializeFormFields(form.templateId, fields, {
          fieldOrder: buildFieldOrder(template),
          meta: {
            savedAt,
            savedBy: actor.name,
            savedByEmail: actor.email ?? null,
            pdfFileName: options?.pdfFileName ?? null,
          },
        });

        set((s) => ({
          forms: s.forms.map((f) =>
            f.id === id
              ? {
                  ...f,
                  content,
                  savedAt,
                  filledBy: actor.name,
                  modifiedAt: savedAt,
                }
              : f,
          ),
          audit: [
            ...s.audit,
            audit(actor.name, `Form saved: ${form.name}`),
          ],
        }));
        return true;
      },

      removeForm: (id) => {
        set((s) => ({ forms: s.forms.filter((f) => f.id !== id) }));
      },

      addCustomForm: (kind = "form") => {
        const id = newId();
        const now = nowIso();
        const name =
          kind === "survey" ? "New survey" : kind === "checklist" ? "New checklist" : "New form";
        set((s) => ({
          customForms: [
            ...s.customForms,
            { id, name, kind, status: "draft", fields: [], responses: [], createdAt: now, modifiedAt: now },
          ],
          audit: [...s.audit, audit(get().currentActor, `${name} created`)],
        }));
        return id;
      },

      updateCustomForm: (id, patch) => {
        set((s) => ({
          customForms: s.customForms.map((f) =>
            f.id === id ? { ...f, ...patch, modifiedAt: nowIso() } : f,
          ),
        }));
      },

      removeCustomForm: (id) => {
        set((s) => ({ customForms: s.customForms.filter((f) => f.id !== id) }));
      },

      addCustomFormField: (formId, type, atIndex) => {
        const fieldId = newId();
        const needsOptions = type === "select" || type === "radio" || type === "checklist";
        const field: CustomFormField = {
          id: fieldId,
          type,
          label:
            type === "section"
              ? "Section heading"
              : type === "paragraph"
                ? "Instructional text goes here."
                : "Untitled question",
          ...(needsOptions ? { options: ["Option 1", "Option 2"] } : {}),
        };
        set((s) => ({
          customForms: s.customForms.map((f) => {
            if (f.id !== formId) return f;
            const fields = [...f.fields];
            const i = atIndex == null || atIndex < 0 || atIndex > fields.length ? fields.length : atIndex;
            fields.splice(i, 0, field);
            return { ...f, fields, modifiedAt: nowIso() };
          }),
        }));
        return fieldId;
      },

      updateCustomFormField: (formId, fieldId, patch) => {
        set((s) => ({
          customForms: s.customForms.map((f) =>
            f.id === formId
              ? {
                  ...f,
                  fields: f.fields.map((fl) => (fl.id === fieldId ? { ...fl, ...patch } : fl)),
                  modifiedAt: nowIso(),
                }
              : f,
          ),
        }));
      },

      removeCustomFormField: (formId, fieldId) => {
        set((s) => ({
          customForms: s.customForms.map((f) =>
            f.id === formId
              ? { ...f, fields: f.fields.filter((fl) => fl.id !== fieldId), modifiedAt: nowIso() }
              : f,
          ),
        }));
      },

      moveCustomFormField: (formId, fieldId, toIndex) => {
        set((s) => ({
          customForms: s.customForms.map((f) => {
            if (f.id !== formId) return f;
            const from = f.fields.findIndex((fl) => fl.id === fieldId);
            if (from === -1) return f;
            const fields = [...f.fields];
            const [moved] = fields.splice(from, 1);
            const to = Math.max(0, Math.min(toIndex, fields.length));
            fields.splice(to, 0, moved!);
            return { ...f, fields, modifiedAt: nowIso() };
          }),
        }));
      },

      addCustomFormResponse: (formId, response) => {
        set((s) => ({
          customForms: s.customForms.map((f) =>
            f.id === formId
              ? {
                  ...f,
                  responses: [...f.responses, { id: newId(), ...response }],
                  modifiedAt: nowIso(),
                }
              : f,
          ),
          audit: [
            ...s.audit,
            audit(response.submittedBy || "Operator", `Response submitted`),
          ],
        }));
      },

      removeCustomFormResponse: (formId, responseId) => {
        set((s) => ({
          customForms: s.customForms.map((f) =>
            f.id === formId
              ? { ...f, responses: f.responses.filter((r) => r.id !== responseId) }
              : f,
          ),
        }));
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

      addRoadDamage: (patch) => {
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
              ...patch,
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

      addOutage: (partial) => {
        const id = newId();
        set((s) => ({
          outages: [
            {
              id,
              type: partial?.type ?? "electricity",
              title: partial?.title ?? "New outage",
              lat: partial?.lat ?? s.situation.lat ?? 0,
              lng: partial?.lng ?? s.situation.lng ?? 0,
              radiusM: partial?.radiusM ?? 800,
              status: partial?.status ?? "reported",
              cause: partial?.cause,
              affected: partial?.affected,
              startedAt: partial?.startedAt ?? new Date().toISOString(),
              etaAt: partial?.etaAt,
              note: partial?.note,
            },
            ...s.outages,
          ],
        }));
        return id;
      },

      updateOutage: (id, patch) => {
        set((s) => ({
          outages: s.outages.map((o) => (o.id === id ? { ...o, ...patch } : o)),
        }));
      },

      removeOutage: (id) => {
        set((s) => ({ outages: s.outages.filter((o) => o.id !== id) }));
      },

      addShift: (partial) => {
        const id = newId();
        const now = Date.now();
        const start = partial?.startsAt ?? new Date(now).toISOString();
        const end = partial?.endsAt ?? new Date(now + 8 * 3_600_000).toISOString();
        set((s) => ({
          shifts: [
            {
              id,
              personnelId: partial?.personnelId ?? null,
              role: partial?.role ?? "",
              startsAt: start,
              endsAt: end,
              note: partial?.note,
            },
            ...s.shifts,
          ],
          audit: [...s.audit, audit(get().currentActor, "Shift added to roster")],
        }));
        return id;
      },

      updateShift: (id, patch) => {
        set((s) => ({
          shifts: s.shifts.map((sh) => (sh.id === id ? { ...sh, ...patch } : sh)),
        }));
      },

      removeShift: (id) => {
        set((s) => ({ shifts: s.shifts.filter((sh) => sh.id !== id) }));
      },

      addCertification: (partial) => {
        const id = newId();
        set((s) => ({
          certifications: [
            {
              id,
              personnelId: partial?.personnelId ?? null,
              name: partial?.name ?? "",
              level: partial?.level ?? "",
              issuer: partial?.issuer ?? "",
              issuedAt: partial?.issuedAt ?? "",
              expiresAt: partial?.expiresAt ?? "",
              reference: partial?.reference ?? "",
              note: partial?.note,
            },
            ...s.certifications,
          ],
          audit: [...s.audit, audit(get().currentActor, "Certification added")],
        }));
        return id;
      },

      updateCertification: (id, patch) => {
        set((s) => ({
          certifications: s.certifications.map((c) => (c.id === id ? { ...c, ...patch } : c)),
        }));
      },

      removeCertification: (id) => {
        set((s) => ({ certifications: s.certifications.filter((c) => c.id !== id) }));
      },

      addInventoryItem: (partial) => {
        const id = newId();
        set((s) => ({
          inventory: [
            {
              id,
              name: partial?.name ?? "",
              category: partial?.category ?? "general",
              quantity: partial?.quantity ?? 0,
              unit: partial?.unit ?? "units",
              minQuantity: partial?.minQuantity ?? 0,
              location: partial?.location ?? "",
              serial: partial?.serial ?? "",
              condition: partial?.condition ?? "serviceable",
              expiryDate: partial?.expiryDate ?? "",
              lastInspection: partial?.lastInspection ?? "",
              inspectionIntervalDays: partial?.inspectionIntervalDays ?? 0,
              notes: partial?.notes ?? "",
            },
            ...s.inventory,
          ],
          audit: [...s.audit, audit(get().currentActor, "Inventory item added")],
        }));
        return id;
      },

      updateInventoryItem: (id, patch) => {
        set((s) => ({
          inventory: s.inventory.map((i) => (i.id === id ? { ...i, ...patch } : i)),
        }));
      },

      removeInventoryItem: (id) => {
        set((s) => ({ inventory: s.inventory.filter((i) => i.id !== id) }));
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
              color: partial?.color ?? nextAnnotationColor(s.mapAnnotations),
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
          audit: [...s.audit, audit(get().currentActor, `Calendar event added: ${event.title}`)],
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
          audit: [...s.audit, audit(get().currentActor, `Operational period ${num} opened`)],
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
            audit(get().currentActor, `Notification queued: ${draft.subject}`),
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
          audit: [...s.audit, audit(get().currentActor, `Play applied: ${play.name}`)],
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

      // -------------------- Live comms (RFC-003) --------------------
      addChannel: () => {
        const id = newId();
        set((s) => ({
          channels: [
            ...s.channels,
            {
              id,
              name: `Channel ${s.channels.length + 1}`,
              function: "",
              mode: "ptt",
              color: "#2563eb",
              sourceFormId: null,
              sourceRowId: null,
              sipRoom: null,
              videoRoom: null,
              pageEnabled: true,
            },
          ],
        }));
        return id;
      },

      updateChannel: (id, patch) => {
        set((s) => ({
          channels: s.channels.map((c) => (c.id === id ? { ...c, ...patch } : c)),
        }));
      },

      removeChannel: (id) => {
        set((s) => ({
          channels: s.channels.filter((c) => c.id !== id),
          fieldUnits: s.fieldUnits.map((u) =>
            u.channelId === id ? { ...u, channelId: null } : u,
          ),
        }));
      },

      syncChannelsFromICS205: () => {
        const state = get();
        const form = findICS205(state.forms);
        if (!form) return 0;
        const synced = channelsFromICS205(form, state.channels);
        const manual = state.channels.filter((c) => !c.sourceRowId);
        set({ channels: [...synced, ...manual] });
        get().recordActivity({
          message: `Comms plan activated — ${synced.length} channel(s) synced from ICS-205`,
          tags: ["comms", "ics-205"],
          kind: "system",
        });
        return synced.length;
      },

      addFieldUnit: (partial) => {
        const requestedId = partial?.id?.trim();
        // Dedupe: a device already on this incident is not added twice.
        if (requestedId) {
          const existing = get().fieldUnits.find((u) => u.id === requestedId);
          if (existing) return existing.id;
        }
        const id = requestedId || newId();
        set((s) => ({
          fieldUnits: [
            ...s.fieldUnits,
            {
              id,
              callsign: partial?.callsign?.trim() || `Unit ${s.fieldUnits.length + 1}`,
              personnelId: null,
              deviceId: partial?.deviceId ?? requestedId ?? null,
              channelId: s.channels[0]?.id ?? null,
              status: "available",
            },
          ],
        }));
        return id;
      },

      updateFieldUnit: (id, patch) => {
        set((s) => ({
          fieldUnits: s.fieldUnits.map((u) => (u.id === id ? { ...u, ...patch } : u)),
        }));
      },

      removeFieldUnit: (id) => {
        set((s) => ({ fieldUnits: s.fieldUnits.filter((u) => u.id !== id) }));
      },

      sendPage: (channelId, body) => {
        const state = get();
        const channel = state.channels.find((c) => c.id === channelId);
        if (!channel) return null;
        const recipients: PageRecipient[] = state.fieldUnits
          .filter((u) => u.channelId === channelId)
          .map((u) => ({
            unitId: u.id,
            callsign: u.callsign,
            status: "queued",
            updatedAt: nowIso(),
          }));
        const page: PageMessage = {
          id: newId(),
          channelId,
          channelName: channel.name,
          body,
          sentBy: "Operator",
          createdAt: nowIso(),
          recipients,
        };
        set((s) => ({ pages: [page, ...s.pages] }));
        get().recordActivity({
          message: `Page to ${channel.name} (${recipients.length} unit${recipients.length === 1 ? "" : "s"}): ${body}`,
          tags: ["comms", "page"],
          kind: "system",
          target: channel.name,
        });
        return page.id;
      },

      markPageDelivered: (pageId, unitId) => {
        set((s) => ({
          pages: s.pages.map((p) =>
            p.id === pageId
              ? {
                  ...p,
                  recipients: p.recipients.map((r) =>
                    r.unitId === unitId && r.status === "queued"
                      ? { ...r, status: "delivered", updatedAt: nowIso() }
                      : r,
                  ),
                }
              : p,
          ),
        }));
      },

      markPageAck: (pageId, unitId) => {
        set((s) => ({
          pages: s.pages.map((p) =>
            p.id === pageId
              ? {
                  ...p,
                  recipients: p.recipients.map((r) =>
                    r.unitId === unitId && r.status !== "ack"
                      ? { ...r, status: "ack", updatedAt: nowIso() }
                      : r,
                  ),
                }
              : p,
          ),
        }));
      },

      raiseDistress: (unitId, kind, source = "manual", coords) => {
        const unit = get().fieldUnits.find((u) => u.id === unitId);
        if (!unit) return;
        const event: DistressEvent = {
          id: newId(),
          unitId,
          unitCallsign: unit.callsign,
          channelId: unit.channelId,
          kind,
          source,
          lat: coords?.lat ?? unit.lat ?? null,
          lng: coords?.lng ?? unit.lng ?? null,
          triggeredAt: nowIso(),
          status: "active",
        };
        set((s) => ({ distressEvents: [event, ...s.distressEvents] }));
        get().recordActivity({
          message: `DISTRESS (${kind.replace("_", " ").toUpperCase()}) — ${unit.callsign}`,
          tags: ["distress", kind],
          kind: "system",
          target: unit.callsign,
        });
      },

      acknowledgeDistress: (id, by) => {
        set((s) => ({
          distressEvents: s.distressEvents.map((d) =>
            d.id === id && d.status === "active"
              ? { ...d, status: "acknowledged", ackBy: by, ackAt: nowIso() }
              : d,
          ),
        }));
        const ev = get().distressEvents.find((d) => d.id === id);
        if (ev) {
          get().recordActivity({
            message: `Distress acknowledged — ${ev.unitCallsign} (by ${by})`,
            tags: ["distress", "ack"],
            kind: "system",
            target: ev.unitCallsign,
          });
        }
      },

      resolveDistress: (id, status) => {
        set((s) => ({
          distressEvents: s.distressEvents.map((d) =>
            d.id === id ? { ...d, status, resolvedAt: nowIso() } : d,
          ),
        }));
        const ev = get().distressEvents.find((d) => d.id === id);
        if (ev) {
          get().recordActivity({
            message: `Distress ${status === "false_alarm" ? "marked false alarm" : "resolved"} — ${ev.unitCallsign}`,
            tags: ["distress", status],
            kind: "system",
            target: ev.unitCallsign,
          });
        }
      },

      resetIncident: () => {
        const name = get().situation.name;
        set({ ...createInitialIncidentState(name) });
      },
    }),
      {
        name: `mitiga-incident-${eventId}`,
        storage: quotaSafeStorage,
        merge: (persisted, current) => ({
          ...(current as IncidentStore),
          ...incidentPersistMerge(persisted, current as IncidentState),
        }),
      },
    ),
  );
}
