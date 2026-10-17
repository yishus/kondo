-- Keep the legacy position column for upgrade compatibility. Current card
-- reads and writes use sort_position, with id as a deterministic tie breaker.
ALTER TABLE cards ADD COLUMN sort_position REAL NOT NULL DEFAULT 1024
  CONSTRAINT cards_sort_position_check CHECK (sort_position >= 0 AND sort_position < 1e300);

WITH ranked AS (
  SELECT id, row_number() OVER (PARTITION BY trip_id, trip_day_id ORDER BY position, id) * 1024.0 AS rank
  FROM cards
)
UPDATE cards SET sort_position = (SELECT rank FROM ranked WHERE ranked.id = cards.id);

DROP INDEX cards_trip_day_position_idx;
DROP INDEX cards_trip_position_idx;
CREATE INDEX cards_trip_day_sort_position_idx ON cards(trip_day_id, sort_position);
CREATE INDEX cards_trip_sort_position_idx ON cards(trip_id, trip_day_id, sort_position);

CREATE TABLE trip_card_order (
  trip_id TEXT PRIMARY KEY NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  revision INTEGER NOT NULL DEFAULT 0,
  move_token TEXT
);
INSERT INTO trip_card_order(trip_id) SELECT id FROM trips;

CREATE TRIGGER trip_card_order_insert AFTER INSERT ON cards
BEGIN
  INSERT INTO trip_card_order(trip_id, revision) VALUES (NEW.trip_id, 1)
  ON CONFLICT(trip_id) DO UPDATE SET revision = revision + 1;
END;

CREATE TRIGGER trip_card_order_delete AFTER DELETE ON cards
BEGIN
  UPDATE trip_card_order SET revision = revision + 1 WHERE trip_id = OLD.trip_id;
END;

CREATE TRIGGER trip_card_order_update AFTER UPDATE OF id, trip_id, trip_day_id, sort_position ON cards
WHEN OLD.id IS NOT NEW.id OR OLD.trip_id IS NOT NEW.trip_id
  OR OLD.trip_day_id IS NOT NEW.trip_day_id OR OLD.sort_position IS NOT NEW.sort_position
BEGIN
  INSERT INTO trip_card_order(trip_id) VALUES (NEW.trip_id) ON CONFLICT(trip_id) DO NOTHING;
  UPDATE trip_card_order SET revision = revision + 1 WHERE trip_id IN (OLD.trip_id, NEW.trip_id);
END;

-- A destination can disappear or move to another trip without containing cards.
CREATE TRIGGER trip_card_order_day_delete AFTER DELETE ON trip_days
BEGIN
  UPDATE trip_card_order SET revision = revision + 1 WHERE trip_id = OLD.trip_id;
END;

CREATE TRIGGER trip_card_order_day_update AFTER UPDATE OF id, trip_id ON trip_days
WHEN OLD.id IS NOT NEW.id OR OLD.trip_id IS NOT NEW.trip_id
BEGIN
  UPDATE trip_card_order SET revision = revision + 1 WHERE trip_id IN (OLD.trip_id, NEW.trip_id);
END;

-- Rebuild snapshots once to replace ordinal positions with fractional ranks.
UPDATE trip_chat_contexts SET revision = revision + 1, context = NULL;

DROP TRIGGER trip_chat_cards_update;
CREATE TRIGGER trip_chat_cards_update AFTER UPDATE OF
  id, trip_id, trip_day_id, card_type, title, description, sort_position,
  google_place_id, google_maps_query, google_place_name, location_subcategory,
  hike_distance_km, hike_elevation_gain_m, transport_mode,
  start_location, end_location, start_location_name, end_location_name,
  departure_time, arrival_time, departure_timezone, arrival_timezone,
  service_number, transport_estimate ON cards
WHEN OLD.id IS NOT NEW.id
  OR OLD.trip_id IS NOT NEW.trip_id
  OR OLD.trip_day_id IS NOT NEW.trip_day_id
  OR OLD.card_type IS NOT NEW.card_type
  OR OLD.title IS NOT NEW.title
  OR OLD.description IS NOT NEW.description
  OR OLD.sort_position IS NOT NEW.sort_position
  OR OLD.google_place_id IS NOT NEW.google_place_id
  OR OLD.google_maps_query IS NOT NEW.google_maps_query
  OR OLD.google_place_name IS NOT NEW.google_place_name
  OR OLD.location_subcategory IS NOT NEW.location_subcategory
  OR OLD.hike_distance_km IS NOT NEW.hike_distance_km
  OR OLD.hike_elevation_gain_m IS NOT NEW.hike_elevation_gain_m
  OR OLD.transport_mode IS NOT NEW.transport_mode
  OR OLD.start_location IS NOT NEW.start_location
  OR OLD.end_location IS NOT NEW.end_location
  OR OLD.start_location_name IS NOT NEW.start_location_name
  OR OLD.end_location_name IS NOT NEW.end_location_name
  OR OLD.departure_time IS NOT NEW.departure_time
  OR OLD.arrival_time IS NOT NEW.arrival_time
  OR OLD.departure_timezone IS NOT NEW.departure_timezone
  OR OLD.arrival_timezone IS NOT NEW.arrival_timezone
  OR OLD.service_number IS NOT NEW.service_number
  OR OLD.transport_estimate IS NOT NEW.transport_estimate
BEGIN
  UPDATE trip_chat_contexts SET revision = revision + 1, context = NULL
  WHERE trip_id IN (OLD.trip_id, NEW.trip_id);
END;
