-- Initial production schema. Apply only to an empty database.
-- Subsequent schema changes belong in new numbered migrations.

CREATE TABLE trips (
  id TEXT PRIMARY KEY NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT ''
);

CREATE TABLE trip_days (
  id TEXT PRIMARY KEY NOT NULL,
  trip_id TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  trip_date TEXT NOT NULL CHECK (trip_date GLOB '????-??-??')
);
CREATE UNIQUE INDEX trip_days_trip_id_trip_date_unique ON trip_days(trip_id, trip_date);

-- Retained for compatibility with the current application schema.
CREATE TABLE day_city_groups (
  id TEXT PRIMARY KEY NOT NULL,
  trip_day_id TEXT NOT NULL REFERENCES trip_days(id) ON DELETE CASCADE,
  city TEXT NOT NULL CHECK (length(trim(city)) > 0),
  position INTEGER NOT NULL DEFAULT 0 CHECK (position >= 0),
  travel_mode TEXT,
  travel_origin TEXT NOT NULL DEFAULT '',
  departure_time TEXT NOT NULL DEFAULT '',
  arrival_time TEXT NOT NULL DEFAULT '',
  service_number TEXT NOT NULL DEFAULT '',
  travel_notes TEXT NOT NULL DEFAULT ''
);
CREATE INDEX day_city_groups_day_position_idx ON day_city_groups(trip_day_id, position);

CREATE TABLE cards (
  id TEXT PRIMARY KEY NOT NULL,
  trip_id TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  trip_day_id TEXT REFERENCES trip_days(id) ON DELETE CASCADE,
  city_group_id TEXT REFERENCES day_city_groups(id),
  title TEXT NOT NULL CHECK (length(trim(title)) > 0),
  description TEXT NOT NULL DEFAULT '',
  position INTEGER NOT NULL DEFAULT 0 CHECK (position >= 0),
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  google_place_id TEXT,
  google_maps_query TEXT,
  type TEXT NOT NULL DEFAULT 'location' CHECK (type IN ('location', 'city', 'transport')),
  transport_mode TEXT,
  start_location TEXT NOT NULL DEFAULT '',
  end_location TEXT NOT NULL DEFAULT '',
  departure_time TEXT NOT NULL DEFAULT '',
  arrival_time TEXT NOT NULL DEFAULT '',
  service_number TEXT NOT NULL DEFAULT '',
  CONSTRAINT cards_unscheduled_city_check CHECK (trip_day_id IS NOT NULL OR city_group_id IS NULL)
);
CREATE INDEX cards_trip_day_position_idx ON cards(trip_day_id, position);
CREATE INDEX cards_trip_position_idx ON cards(trip_id, trip_day_id, position);

CREATE TABLE card_attachments (
  id TEXT PRIMARY KEY NOT NULL,
  card_id TEXT NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  filename TEXT NOT NULL,
  content_type TEXT NOT NULL CHECK (content_type IN ('image/jpeg', 'application/pdf')),
  size INTEGER NOT NULL CHECK (size > 0 AND size <= 10485760),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX card_attachments_card_idx ON card_attachments(card_id);

CREATE TABLE accommodation_places (
  id TEXT PRIMARY KEY NOT NULL,
  trip_id TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (length(trim(name)) > 0)
);
CREATE INDEX accommodation_places_trip_idx ON accommodation_places(trip_id);

CREATE TABLE accommodations (
  id TEXT PRIMARY KEY NOT NULL,
  place_id TEXT NOT NULL REFERENCES accommodation_places(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('hotel', 'airbnb')),
  google_place_id TEXT,
  google_maps_query TEXT,
  currency TEXT NOT NULL DEFAULT 'SGD',
  date_options TEXT NOT NULL DEFAULT '[]',
  confirmed_option_id TEXT,
  booked_via TEXT NOT NULL DEFAULT '',
  free_cancellation INTEGER NOT NULL DEFAULT 0,
  cancellation_until TEXT NOT NULL DEFAULT '',
  cancellation_timezone TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT ''
);
CREATE INDEX accommodations_place_idx ON accommodations(place_id);

CREATE TABLE accommodation_documents (
  id TEXT PRIMARY KEY NOT NULL,
  accommodation_id TEXT NOT NULL UNIQUE REFERENCES accommodations(id) ON DELETE CASCADE,
  filename TEXT NOT NULL,
  size INTEGER NOT NULL CHECK (size > 0 AND size <= 10485760)
);

CREATE TABLE trip_notes (
  trip_id TEXT PRIMARY KEY NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  body TEXT NOT NULL DEFAULT ''
);

CREATE TABLE trip_todos (
  id TEXT PRIMARY KEY NOT NULL,
  trip_id TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  title TEXT NOT NULL CHECK (length(trim(title)) > 0 AND length(title) <= 500),
  completed INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX trip_todos_trip_idx ON trip_todos(trip_id);
