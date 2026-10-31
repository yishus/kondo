-- Retain the constrained column so cards and all child rows keep their IDs
-- and rowids. Replace only the active type column to allow Event cards.
DROP TRIGGER trip_chat_cards_update;
ALTER TABLE cards RENAME COLUMN card_type TO legacy_card_type;
ALTER TABLE cards ADD COLUMN card_type TEXT NOT NULL DEFAULT 'location'
  CHECK (card_type IN ('location', 'hike', 'city', 'transport', 'event'));
UPDATE cards SET card_type = legacy_card_type;

-- Keep context invalidation attached to the active type column.
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
