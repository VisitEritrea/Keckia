import {
  pgTable,
  serial,
  text,
  integer,
  timestamp,
  jsonb,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: serial().primaryKey(),
  username: text().notNull().unique(),
  email: text().unique(),
  fullName: text("full_name").notNull(),
  role: text().notNull(),
  passwordHash: text("password_hash").notNull(),
  active: integer().notNull().default(1),
  mustChangePassword: integer("must_change_password").notNull().default(0),
  lastLoginAt: timestamp("last_login_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const sessions = pgTable("sessions", {
  token: text().primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").defaultNow(),
  expiresAt: timestamp("expires_at").notNull(),
});

export const records = pgTable(
  "records",
  {
    id: text().notNull(),
    collection: text().notNull(),
    data: jsonb().notNull().default({}),
    createdBy: text("created_by").notNull().default(""),
    updatedBy: text("updated_by").notNull().default(""),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (t) => [
    uniqueIndex("records_collection_id_key").on(t.collection, t.id),
    index("records_collection_idx").on(t.collection),
    index("records_collection_created_by_idx").on(t.collection, t.createdBy),
  ],
);

export const auditLog = pgTable(
  "audit_log",
  {
    id: serial().primaryKey(),
    actor: text().notNull().default(""),
    actorRole: text("actor_role").notNull().default(""),
    action: text().notNull(),
    collection: text().notNull().default(""),
    recordId: text("record_id").notNull().default(""),
    summary: text().notNull(),
    metadata: jsonb().default({}),
    severity: text().notNull().default("info"),
    timestamp: timestamp("timestamp").defaultNow(),
  },
  (t) => [
    index("audit_log_timestamp_idx").on(t.timestamp),
    index("audit_log_action_idx").on(t.action),
    index("audit_log_actor_idx").on(t.actor),
  ],
);
