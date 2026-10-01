import { relations, sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
  unique,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

export const user = sqliteTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: integer("email_verified", { mode: "boolean" })
    .default(false)
    .notNull(),
  image: text("image"),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
    .notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
    .$onUpdate(() => new Date())
    .notNull(),
});

export const session = sqliteTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    token: text("token").notNull().unique(),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .$onUpdate(() => new Date())
      .notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (table) => [index("session_user_id_idx").on(table.userId)],
);

export const account = sqliteTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: integer("access_token_expires_at", {
      mode: "timestamp_ms",
    }),
    refreshTokenExpiresAt: integer("refresh_token_expires_at", {
      mode: "timestamp_ms",
    }),
    scope: text("scope"),
    password: text("password"),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [index("account_user_id_idx").on(table.userId)],
);

export const verification = sqliteTable(
  "verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [index("verification_identifier_idx").on(table.identifier)],
);

export const rateLimit = sqliteTable(
  "rate_limit",
  {
    id: text("id").primaryKey(),
    key: text("key").notNull().unique(),
    count: integer("count").notNull(),
    lastRequest: integer("last_request").notNull(),
  },
  (table) => [index("rate_limit_last_request_idx").on(table.lastRequest)],
);

export const trips = sqliteTable("trips", {
  id: text("id").primaryKey(),
  code: text("code").unique(),
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
  timezone: text("timezone"),
});

export const tripOwners = sqliteTable(
  "trip_owners",
  {
    tripId: text("trip_id")
      .notNull()
      .references(() => trips.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    primaryKey({ columns: [table.tripId, table.userId] }),
    index("trip_owners_user_id_idx").on(table.userId),
  ],
);

export const tripDays = sqliteTable(
  "trip_days",
  {
    id: text("id").primaryKey(),
    tripId: text("trip_id")
      .notNull()
      .references(() => trips.id, { onDelete: "cascade" }),
    tripDate: text("trip_date").notNull(),
    timezone: text("timezone"),
    timeEstimate: text("time_estimate", { mode: "json" }).$type<import("../day-estimate").DayEstimate>(),
  },
  (table) => [
    unique("trip_days_trip_id_trip_date_unique").on(
      table.tripId,
      table.tripDate,
    ),
    check(
      "trip_days_trip_date_check",
      sql`${table.tripDate} GLOB '????-??-??'`,
    ),
  ],
);

export const cards = sqliteTable(
  "cards",
  {
    id: text("id").primaryKey(),
    tripId: text("trip_id")
      .notNull()
      .references(() => trips.id, { onDelete: "cascade" }),
    tripDayId: text("trip_day_id")
      .references(() => tripDays.id, { onDelete: "cascade" }),
    // Legacy reference kept only for upgrading existing databases.
    cityGroupId: text("city_group_id").references(() => dayCityGroups.id),
    // The legacy type column remains for migration compatibility.
    type: text("card_type", { enum: ["location", "hike", "city", "transport"] }).notNull().default("location"),
    transportMode: text("transport_mode"),
    startLocation: text("start_location").notNull().default(""),
    endLocation: text("end_location").notNull().default(""),
    startLocationName: text("start_location_name").notNull().default(""),
    endLocationName: text("end_location_name").notNull().default(""),
    departureTime: text("departure_time").notNull().default(""),
    arrivalTime: text("arrival_time").notNull().default(""),
    departureTimezone: text("departure_timezone"),
    arrivalTimezone: text("arrival_timezone"),
    serviceNumber: text("service_number").notNull().default(""),
    transportEstimate: text("transport_estimate", { mode: "json" }).$type<import("../transport-estimate").TransportEstimate>(),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    position: integer("position").notNull().default(0),
    googlePlaceId: text("google_place_id"),
    googleMapsQuery: text("google_maps_query"),
    googlePlaceName: text("google_place_name"),
    googlePhoto: text("google_photo", { mode: "json" }).$type<{ imageUrl: string; googleMapsUri: string }>(),
    // The original location_category column had a fixed database constraint.
    // Store evolving subcategories here so adding choices does not require a
    // destructive cards-table rebuild.
    locationCategory: text("location_subcategory", { enum: ["place_of_interest", "food"] }),
    hikeDistanceKm: real("hike_distance_km"),
    hikeElevationGainM: real("hike_elevation_gain_m"),
    coverAttachmentId: text("cover_attachment_id"),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    check("cards_type_check", sql`${table.type} IN ('location', 'hike', 'city', 'transport')`),
    check("cards_title_check", sql`length(trim(${table.title})) > 0`),
    check("cards_position_check", sql`${table.position} >= 0`),
    check("cards_hike_distance_check", sql`${table.hikeDistanceKm} >= 0`),
    check("cards_hike_elevation_gain_check", sql`${table.hikeElevationGainM} >= 0`),
    check("cards_unscheduled_city_check", sql`${table.tripDayId} IS NOT NULL OR ${table.cityGroupId} IS NULL`),
    index("cards_trip_day_position_idx").on(table.tripDayId, table.position),
    index("cards_trip_position_idx").on(table.tripId, table.tripDayId, table.position),
  ],
);

// Legacy storage retained for migration compatibility. The board uses only cards.
export const dayCityGroups = sqliteTable(
  "day_city_groups",
  {
    id: text("id").primaryKey(),
    tripDayId: text("trip_day_id")
      .notNull()
      .references(() => tripDays.id, { onDelete: "cascade" }),
    city: text("city").notNull(),
    position: integer("position").notNull().default(0),
    travelMode: text("travel_mode"),
    travelOrigin: text("travel_origin").notNull().default(""),
    departureTime: text("departure_time").notNull().default(""),
    arrivalTime: text("arrival_time").notNull().default(""),
    serviceNumber: text("service_number").notNull().default(""),
    travelNotes: text("travel_notes").notNull().default(""),
  },
  (table) => [
    check("day_city_groups_city_check", sql`length(trim(${table.city})) > 0`),
    check("day_city_groups_position_check", sql`${table.position} >= 0`),
    index("day_city_groups_day_position_idx").on(table.tripDayId, table.position),
  ],
);

export type Trip = typeof trips.$inferSelect;

export const cardAttachments = sqliteTable("card_attachments", {
  id: text("id").primaryKey(),
  cardId: text("card_id").notNull().references(() => cards.id, { onDelete: "cascade" }),
  filename: text("filename").notNull(),
  contentType: text("content_type").notNull(),
  size: integer("size").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  index("card_attachments_card_idx").on(table.cardId),
  check("card_attachments_type_check", sql`${table.contentType} IN ('image/jpeg', 'image/png', 'application/pdf', 'application/gpx+xml')`),
  uniqueIndex("card_attachments_one_gpx_idx").on(table.cardId).where(sql`${table.contentType} = 'application/gpx+xml'`),
  check("card_attachments_size_check", sql`${table.size} > 0 AND ${table.size} <= 10485760`),
]);

export type CardAttachment = typeof cardAttachments.$inferSelect;
export type TripDay = typeof tripDays.$inferSelect;
export type Card = typeof cards.$inferSelect;

export const cardChats = sqliteTable("card_chats", {
  cardId: text("card_id").notNull().references(() => cards.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  messages: text("messages", { mode: "json" }).$type<import("../card-chat").ChatMessage[]>().notNull().default([]),
  lockId: text("lock_id"),
  lockedUntil: integer("locked_until").notNull().default(0),
}, (table) => [
  primaryKey({ columns: [table.cardId, table.userId] }),
  index("card_chats_user_idx").on(table.userId),
]);

export const tripChats = sqliteTable("trip_chats", {
  tripId: text("trip_id").notNull().references(() => trips.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  messages: text("messages", { mode: "json" }).$type<import("../trip-chat").TripChatMessage[]>().notNull().default([]),
  lockId: text("lock_id"),
  lockedUntil: integer("locked_until").notNull().default(0),
}, (table) => [primaryKey({ columns: [table.tripId, table.userId] }), index("trip_chats_user_idx").on(table.userId)]);

// Migration triggers invalidate this snapshot on every source-table mutation.
export const tripChatContexts = sqliteTable("trip_chat_contexts", {
  tripId: text("trip_id").primaryKey().references(() => trips.id, { onDelete: "cascade" }),
  revision: integer("revision").notNull().default(0),
  context: text("context", { mode: "json" }).$type<Record<string, unknown>>(),
});

export const cityCardLocations = sqliteTable("city_card_locations", {
  id: text("id").primaryKey(),
  cardId: text("card_id").notNull().references(() => cards.id, { onDelete: "cascade" }),
  googlePlaceId: text("google_place_id").notNull(),
  googleMapsQuery: text("google_maps_query").notNull(),
  googlePlaceName: text("google_place_name"),
  locationType: text("location_type").notNull(),
  position: integer("position").notNull().default(0),
}, (table) => [
  unique("city_card_locations_card_place_unique").on(table.cardId, table.googlePlaceId),
  index("city_card_locations_card_position_idx").on(table.cardId, table.position),
  check("city_card_locations_query_check", sql`length(trim(${table.googleMapsQuery})) BETWEEN 1 AND 200`),
  check("city_card_locations_type_check", sql`length(trim(${table.locationType})) BETWEEN 1 AND 50`),
  check("city_card_locations_position_check", sql`${table.position} >= 0`),
]);

export type CityCardLocation = typeof cityCardLocations.$inferSelect;

export const accommodationPlaces = sqliteTable("accommodation_places", {
  id: text("id").primaryKey(),
  tripId: text("trip_id").notNull().references(() => trips.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
}, (table) => [index("accommodation_places_trip_idx").on(table.tripId), check("accommodation_places_name_check", sql`length(trim(${table.name})) > 0`)]);

export const accommodations = sqliteTable("accommodations", {
  id: text("id").primaryKey(),
  placeId: text("place_id").notNull().references(() => accommodationPlaces.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  kind: text("kind", { enum: ["hotel", "airbnb"] }).notNull(),
  googlePlaceId: text("google_place_id"),
  googleMapsQuery: text("google_maps_query"),
  currency: text("currency").notNull().default("SGD"),
  dateOptions: text("date_options", { mode: "json" }).$type<import("../accommodations").StayOption[]>().notNull().default([]),
  confirmedOptionId: text("confirmed_option_id"),
  bookedVia: text("booked_via").notNull().default(""),
  freeCancellation: integer("free_cancellation", { mode: "boolean" }).notNull().default(false),
  cancellationUntil: text("cancellation_until").notNull().default(""),
  cancellationTimezone: text("cancellation_timezone").notNull().default(""),
  description: text("description").notNull().default(""),
}, (table) => [index("accommodations_place_idx").on(table.placeId), check("accommodations_kind_check", sql`${table.kind} IN ('hotel', 'airbnb')`)]);

export const accommodationDocuments = sqliteTable("accommodation_documents", {
  id: text("id").primaryKey(),
  accommodationId: text("accommodation_id").notNull().unique().references(() => accommodations.id, { onDelete: "cascade" }),
  filename: text("filename").notNull(),
  size: integer("size").notNull(),
}, (table) => [check("accommodation_documents_size_check", sql`${table.size} > 0 AND ${table.size} <= 10485760`)]);

export type Accommodation = typeof accommodations.$inferSelect;
export type AccommodationDocument = typeof accommodationDocuments.$inferSelect;

export const tripNotes = sqliteTable("trip_notes", {
  tripId: text("trip_id").primaryKey().references(() => trips.id, { onDelete: "cascade" }),
  body: text("body").notNull().default(""),
});

export const tripAttachments = sqliteTable("trip_attachments", {
  id: text("id").primaryKey(),
  tripId: text("trip_id").notNull().references(() => trips.id, { onDelete: "cascade" }),
  filename: text("filename").notNull(),
  contentType: text("content_type").notNull(),
  size: integer("size").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  index("trip_attachments_trip_idx").on(table.tripId),
  check("trip_attachments_type_check", sql`${table.contentType} IN ('image/jpeg', 'image/png', 'application/pdf')`),
  check("trip_attachments_size_check", sql`${table.size} > 0 AND ${table.size} <= 10485760`),
]);

export type TripAttachment = typeof tripAttachments.$inferSelect;

export const tripTodos = sqliteTable("trip_todos", {
  id: text("id").primaryKey(),
  tripId: text("trip_id").notNull().references(() => trips.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  ownerId: text("owner_id").references(() => user.id, { onDelete: "set null" }),
  completed: integer("completed", { mode: "boolean" }).notNull().default(false),
}, (table) => [
  index("trip_todos_trip_idx").on(table.tripId),
  check("trip_todos_title_check", sql`length(trim(${table.title})) > 0 AND length(${table.title}) <= 500`),
]);

// Relational queries aggregate each collection in SQL without multiplying rows.
export const userRelations = relations(user, ({ many }) => ({
  sessions: many(session),
  accounts: many(account),
}));
export const sessionRelations = relations(session, ({ one }) => ({
  user: one(user, { fields: [session.userId], references: [user.id] }),
}));
export const accountRelations = relations(account, ({ one }) => ({
  user: one(user, { fields: [account.userId], references: [user.id] }),
}));
export const tripRelations = relations(trips, ({ one, many }) => ({
  owners: many(tripOwners),
  days: many(tripDays),
  cards: many(cards),
  places: many(accommodationPlaces),
  notes: one(tripNotes),
  attachments: many(tripAttachments),
  todos: many(tripTodos),
}));
export const tripOwnerRelations = relations(tripOwners, ({ one }) => ({
  trip: one(trips, { fields: [tripOwners.tripId], references: [trips.id] }),
  user: one(user, { fields: [tripOwners.userId], references: [user.id] }),
}));
export const tripDayRelations = relations(tripDays, ({ one }) => ({
  trip: one(trips, { fields: [tripDays.tripId], references: [trips.id] }),
}));
export const cardRelations = relations(cards, ({ one, many }) => ({
  trip: one(trips, { fields: [cards.tripId], references: [trips.id] }),
  attachments: many(cardAttachments),
  cityLocations: many(cityCardLocations),
}));
export const cardAttachmentRelations = relations(cardAttachments, ({ one }) => ({
  card: one(cards, { fields: [cardAttachments.cardId], references: [cards.id] }),
}));
export const cityCardLocationRelations = relations(cityCardLocations, ({ one }) => ({
  card: one(cards, { fields: [cityCardLocations.cardId], references: [cards.id] }),
}));
export const accommodationPlaceRelations = relations(accommodationPlaces, ({ one, many }) => ({
  trip: one(trips, { fields: [accommodationPlaces.tripId], references: [trips.id] }),
  accommodations: many(accommodations),
}));
export const accommodationRelations = relations(accommodations, ({ one }) => ({
  place: one(accommodationPlaces, { fields: [accommodations.placeId], references: [accommodationPlaces.id] }),
  document: one(accommodationDocuments, { fields: [accommodations.id], references: [accommodationDocuments.accommodationId] }),
}));
export const accommodationDocumentRelations = relations(accommodationDocuments, ({ one }) => ({
  accommodation: one(accommodations, { fields: [accommodationDocuments.accommodationId], references: [accommodations.id] }),
}));
export const tripNotesRelations = relations(tripNotes, ({ one }) => ({
  trip: one(trips, { fields: [tripNotes.tripId], references: [trips.id] }),
}));
export const tripAttachmentRelations = relations(tripAttachments, ({ one }) => ({
  trip: one(trips, { fields: [tripAttachments.tripId], references: [trips.id] }),
}));
export const tripTodoRelations = relations(tripTodos, ({ one }) => ({
  trip: one(trips, { fields: [tripTodos.tripId], references: [trips.id] }),
}));
