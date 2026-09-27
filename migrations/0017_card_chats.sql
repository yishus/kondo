CREATE TABLE card_chats (
  card_id TEXT NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  messages TEXT NOT NULL DEFAULT '[]',
  lock_id TEXT,
  locked_until INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (card_id, user_id)
);
CREATE INDEX card_chats_user_idx ON card_chats(user_id);
