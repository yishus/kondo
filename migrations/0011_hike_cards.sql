-- Keep the old constrained type column so child rows and foreign keys survive.
ALTER TABLE cards ADD COLUMN card_type TEXT NOT NULL DEFAULT 'location'
  CHECK (card_type IN ('location', 'hike', 'city', 'transport'));
UPDATE cards SET card_type = CASE
  WHEN type = 'location' AND location_subcategory = 'hike' THEN 'hike'
  ELSE type END;
UPDATE cards SET location_subcategory = NULL WHERE card_type = 'hike';

CREATE TABLE card_attachments_new (
  id TEXT PRIMARY KEY NOT NULL,
  card_id TEXT NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  filename TEXT NOT NULL,
  content_type TEXT NOT NULL CHECK (content_type IN ('image/jpeg', 'image/png', 'application/pdf', 'application/gpx+xml')),
  size INTEGER NOT NULL CHECK (size > 0 AND size <= 10485760),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO card_attachments_new (id, card_id, filename, content_type, size, created_at)
SELECT id, card_id, filename, content_type, size, created_at FROM card_attachments;
DROP TABLE card_attachments;
ALTER TABLE card_attachments_new RENAME TO card_attachments;
CREATE INDEX card_attachments_card_idx ON card_attachments(card_id);
CREATE UNIQUE INDEX card_attachments_one_gpx_idx ON card_attachments(card_id)
  WHERE content_type = 'application/gpx+xml';
