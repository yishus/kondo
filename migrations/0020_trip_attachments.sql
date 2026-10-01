CREATE TABLE trip_attachments (
  id TEXT PRIMARY KEY NOT NULL,
  trip_id TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  filename TEXT NOT NULL,
  content_type TEXT NOT NULL,
  size INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT trip_attachments_type_check CHECK (content_type IN ('image/jpeg', 'image/png', 'application/pdf')),
  CONSTRAINT trip_attachments_size_check CHECK (size > 0 AND size <= 10485760)
);
CREATE INDEX trip_attachments_trip_idx ON trip_attachments(trip_id);
