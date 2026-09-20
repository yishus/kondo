ALTER TABLE cards ADD COLUMN location_category TEXT
  CHECK (location_category IS NULL OR location_category IN ('place_of_interest', 'food'));
