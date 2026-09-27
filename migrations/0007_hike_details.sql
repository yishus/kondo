ALTER TABLE cards ADD COLUMN hike_distance_km REAL
  CONSTRAINT cards_hike_distance_check CHECK (hike_distance_km >= 0);
ALTER TABLE cards ADD COLUMN hike_elevation_gain_m REAL
  CONSTRAINT cards_hike_elevation_gain_check CHECK (hike_elevation_gain_m >= 0);
