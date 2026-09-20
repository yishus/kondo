CREATE TABLE city_card_locations (
  id TEXT PRIMARY KEY NOT NULL,
  card_id TEXT NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  google_place_id TEXT NOT NULL,
  google_maps_query TEXT NOT NULL CHECK (length(trim(google_maps_query)) BETWEEN 1 AND 200),
  location_type TEXT NOT NULL CHECK (length(trim(location_type)) BETWEEN 1 AND 50),
  position INTEGER NOT NULL DEFAULT 0 CHECK (position >= 0),
  CONSTRAINT city_card_locations_card_place_unique UNIQUE (card_id, google_place_id)
);
CREATE INDEX city_card_locations_card_position_idx ON city_card_locations(card_id, position);
