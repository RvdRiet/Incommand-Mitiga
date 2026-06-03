import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const incidentStatusEnum = pgEnum("incident_status", [
  "planning",
  "active",
  "demobilization",
  "closed",
]);

export const incidentSeverityEnum = pgEnum("incident_severity", [
  "low",
  "moderate",
  "high",
  "critical",
]);

export const membershipRoleEnum = pgEnum("membership_role", [
  "tenant_admin",
  "org_admin",
  "planner",
  "incident_manager",
  "viewer",
]);

export const icsFormCodeEnum = pgEnum("ics_form_code", [
  "ICS_201",
  "ICS_202",
  "ICS_203",
  "ICS_204",
  "ICS_205",
  "ICS_206",
  "ICS_213",
  "ICS_214",
]);

export const tenants = pgTable("tenants", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const organizations = pgTable(
  "organizations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tenantIdx: index("organizations_tenant_idx").on(t.tenantId),
  }),
);

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    name: text("name"),
    passwordHash: text("password_hash"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tenantEmail: uniqueIndex("users_tenant_email").on(t.tenantId, t.email),
  }),
);

export const memberships = pgTable(
  "memberships",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    role: membershipRoleEnum("role").notNull().default("viewer"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    userOrg: uniqueIndex("memberships_user_org").on(t.userId, t.organizationId),
  }),
);

export const incidents = pgTable(
  "incidents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    status: incidentStatusEnum("status").notNull().default("planning"),
    severity: incidentSeverityEnum("severity").notNull().default("moderate"),
    isExercise: boolean("is_exercise").notNull().default(false),
    description: text("description"),
    createdBy: uuid("created_by").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tenantUpdated: index("incidents_tenant_updated_idx").on(t.tenantId, t.updatedAt),
    orgIdx: index("incidents_org_idx").on(t.organizationId),
  }),
);

export const operationalPeriods = pgTable(
  "operational_periods",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    incidentId: uuid("incident_id")
      .notNull()
      .references(() => incidents.id, { onDelete: "cascade" }),
    number: integer("number").notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    endedAt: timestamp("ended_at", { withTimezone: true }),
  },
  (t) => ({
    incidentNumber: uniqueIndex("operational_periods_incident_number").on(
      t.incidentId,
      t.number,
    ),
    tenantIdx: index("operational_periods_tenant_idx").on(t.tenantId),
  }),
);

/**
 * PostGIS tables `planning_areas`, `affected_zones`, and `routes` are defined in
 * `migrations/0001_initial.sql` only. Use `src/db/geo.ts` helpers for geometry IO.
 */

export const icsFormInstances = pgTable(
  "ics_form_instances",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    incidentId: uuid("incident_id")
      .notNull()
      .references(() => incidents.id, { onDelete: "cascade" }),
    operationalPeriodId: uuid("operational_period_id").references(
      () => operationalPeriods.id,
      { onDelete: "set null" },
    ),
    code: icsFormCodeEnum("code").notNull(),
    schemaVersion: integer("schema_version").notNull().default(1),
    payload: jsonb("payload")
      .notNull()
      .$defaultFn(() => ({})),
    createdBy: uuid("created_by").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tenantIdx: index("ics_form_instances_tenant_idx").on(t.tenantId),
    incidentIdx: index("ics_form_instances_incident_idx").on(t.incidentId),
  }),
);

export const auditLog = pgTable(
  "audit_log",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    actorId: uuid("actor_id").references(() => users.id),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: uuid("entity_id"),
    metadata: jsonb("metadata")
      .notNull()
      .$defaultFn(() => ({})),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tenantCreated: index("audit_log_tenant_created_idx").on(t.tenantId, t.createdAt),
  }),
);
