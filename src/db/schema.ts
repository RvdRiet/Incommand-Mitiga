import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
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
    // Lifecycle + security (0005). `tokenVersion` bumps to revoke live JWTs.
    status: text("status").notNull().default("active"),
    emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true }),
    passwordChangedAt: timestamp("password_changed_at", { withTimezone: true }),
    tokenVersion: integer("token_version").notNull().default(0),
    failedLoginCount: integer("failed_login_count").notNull().default(0),
    lockedUntil: timestamp("locked_until", { withTimezone: true }),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
    // TOTP MFA (0009). Secret is stored encrypted (src/lib/auth/secrets.ts).
    totpSecret: text("totp_secret"),
    totpEnabled: boolean("totp_enabled").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tenantEmail: uniqueIndex("users_tenant_email").on(t.tenantId, t.email),
  }),
);

/**
 * One-time tokens for admin invites, password resets, and email verification.
 * Only the SHA-256 hash is stored; the raw token lives in the emailed link.
 * See migrations/0005_auth_lifecycle.sql.
 */
export const authTokens = pgTable(
  "auth_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    purpose: text("purpose").notNull(), // 'invite' | 'password_reset' | 'email_verify'
    email: text("email").notNull(),
    tokenHash: text("token_hash").notNull().unique(),
    role: membershipRoleEnum("role"),
    organizationId: uuid("organization_id").references(() => organizations.id, {
      onDelete: "cascade",
    }),
    userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tenantIdx: index("auth_tokens_tenant_idx").on(t.tenantId),
    emailIdx: index("auth_tokens_email_idx").on(t.tenantId, t.email),
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

/**
 * The full operational state of an incident as one synced JSON document (the
 * client's local-first Zustand state). `rev` is a monotonic version for optimistic
 * concurrency — the offline outbox sends the rev it based its edit on. See
 * migrations/0003_sync_state.sql.
 */
export const incidentState = pgTable(
  "incident_state",
  {
    incidentId: uuid("incident_id")
      .primaryKey()
      .references(() => incidents.id, { onDelete: "cascade" }),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    state: jsonb("state")
      .notNull()
      .$defaultFn(() => ({})),
    rev: bigint("rev", { mode: "number" }).notNull().default(1),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    updatedBy: uuid("updated_by").references(() => users.id, { onDelete: "set null" }),
  },
  (t) => ({
    tenantIdx: index("incident_state_tenant_idx").on(t.tenantId),
  }),
);

/**
 * Per-role module visibility, per tenant. One row per (tenant, role) holding the
 * allowed module slugs. No row = default open (the role sees everything). See
 * migrations/0006_role_permissions.sql.
 */
export const rolePermissions = pgTable(
  "role_permissions",
  {
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    role: membershipRoleEnum("role").notNull(),
    modules: jsonb("modules").notNull().$type<string[]>().$defaultFn(() => []),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    updatedBy: uuid("updated_by").references(() => users.id, { onDelete: "set null" }),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.tenantId, t.role] }),
  }),
);

/**
 * Per-module slice of an incident's state (0007). The monolithic incident_state
 * doc is split into one row per module so reads/writes can be authorized per
 * module. The incident-level `rev` in incident_state remains the concurrency anchor.
 */
export const incidentModuleState = pgTable(
  "incident_module_state",
  {
    incidentId: uuid("incident_id")
      .notNull()
      .references(() => incidents.id, { onDelete: "cascade" }),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    moduleSlug: text("module_slug").notNull(),
    state: jsonb("state").notNull().$defaultFn(() => ({})),
    rev: bigint("rev", { mode: "number" }).notNull().default(1),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    updatedBy: uuid("updated_by").references(() => users.id, { onDelete: "set null" }),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.incidentId, t.moduleSlug] }),
    tenantIdx: index("incident_module_state_tenant_idx").on(t.tenantId),
  }),
);

/** Metadata registry for blobs stored in S3/MinIO (PDFs, photos, video). */
export const blobs = pgTable(
  "blobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    incidentId: uuid("incident_id").references(() => incidents.id, {
      onDelete: "set null",
    }),
    bucket: text("bucket").notNull(),
    objectKey: text("object_key").notNull(),
    contentType: text("content_type"),
    sizeBytes: bigint("size_bytes", { mode: "number" }),
    kind: text("kind"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
  },
  (t) => ({
    tenantIdx: index("blobs_tenant_idx").on(t.tenantId),
    incidentIdx: index("blobs_incident_idx").on(t.incidentId),
    bucketKey: uniqueIndex("blobs_bucket_key").on(t.bucket, t.objectKey),
  }),
);

/** Organisation-wide personnel roster (people + experience/history), tenant-scoped. */
export const orgPersonnel = pgTable(
  "org_personnel",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    name: text("name").notNull().default(""),
    role: text("role").notNull().default(""),
    team: text("team"),
    phone: text("phone"),
    email: text("email"),
    experience: text("experience"),
    addedAt: timestamp("added_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tenantIdx: index("org_personnel_tenant_idx").on(t.tenantId),
  }),
);

/** Daily attendance per roster person, tenant-scoped. */
export const attendanceRecords = pgTable(
  "attendance_records",
  {
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    personId: uuid("person_id").notNull(),
    date: text("date").notNull(),
    status: text("status").notNull(),
    checkInAt: text("check_in_at"),
    note: text("note"),
    markedAt: timestamp("marked_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.tenantId, t.personId, t.date] }),
    tenantIdx: index("attendance_tenant_idx").on(t.tenantId),
  }),
);
