CREATE TABLE rate_limit (
  id TEXT PRIMARY KEY NOT NULL,
  key TEXT NOT NULL,
  count INTEGER NOT NULL,
  last_request INTEGER NOT NULL
);

CREATE UNIQUE INDEX rate_limit_key_unique ON rate_limit(key);
CREATE INDEX rate_limit_last_request_idx ON rate_limit(last_request);
