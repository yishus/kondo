-- Keep internal UUIDs and add stable, public URL codes.
-- Nullable for compatibility with older application versions during rollout.
ALTER TABLE trips ADD COLUMN code TEXT;
CREATE UNIQUE INDEX trips_code_unique ON trips (code);

UPDATE trips SET code =
  substr('23456789abcdefghijkmnpqrstuvwxyz', (random() & 31) + 1, 1) ||
  substr('23456789abcdefghijkmnpqrstuvwxyz', (random() & 31) + 1, 1) ||
  substr('23456789abcdefghijkmnpqrstuvwxyz', (random() & 31) + 1, 1) ||
  substr('23456789abcdefghijkmnpqrstuvwxyz', (random() & 31) + 1, 1) ||
  substr('23456789abcdefghijkmnpqrstuvwxyz', (random() & 31) + 1, 1) ||
  substr('23456789abcdefghijkmnpqrstuvwxyz', (random() & 31) + 1, 1) ||
  substr('23456789abcdefghijkmnpqrstuvwxyz', (random() & 31) + 1, 1) ||
  substr('23456789abcdefghijkmnpqrstuvwxyz', (random() & 31) + 1, 1)
WHERE code IS NULL;
