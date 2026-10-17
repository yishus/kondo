CREATE TABLE trip_live_chats (
  trip_id TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  messages TEXT NOT NULL DEFAULT '[]',
  lock_id TEXT,
  locked_until INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (trip_id, user_id)
);
CREATE INDEX trip_live_chats_user_idx ON trip_live_chats(user_id);

CREATE TABLE journal_entries (
  id TEXT PRIMARY KEY NOT NULL,
  trip_id TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  body TEXT NOT NULL CHECK (length(body) <= 10000),
  visibility TEXT NOT NULL DEFAULT 'private' CHECK (visibility IN ('private', 'public')),
  created_at TEXT NOT NULL,
  timezone TEXT NOT NULL
);
CREATE INDEX journal_entries_trip_created_idx ON journal_entries(trip_id, created_at);

CREATE TABLE journal_images (
  id TEXT PRIMARY KEY NOT NULL,
  entry_id TEXT NOT NULL REFERENCES journal_entries(id) ON DELETE CASCADE,
  filename TEXT NOT NULL,
  content_type TEXT NOT NULL CHECK (content_type IN ('image/jpeg', 'image/png', 'image/webp', 'image/gif')),
  size INTEGER NOT NULL CHECK (size > 0 AND size <= 10485760),
  position INTEGER NOT NULL CHECK (position BETWEEN 0 AND 4),
  UNIQUE (entry_id, position)
);
