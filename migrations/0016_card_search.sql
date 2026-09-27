ALTER TABLE cards ADD COLUMN google_place_name TEXT;
ALTER TABLE city_card_locations ADD COLUMN google_place_name TEXT;

-- Keep searchable source text in one place for backfill and trigger maintenance.
CREATE VIEW card_search_documents AS
SELECT c.rowid AS rowid, c.title, c.description,
  trim(coalesce(c.google_place_name, '') || ' ' || coalesce(c.google_maps_query, '') || ' ' ||
    coalesce((SELECT group_concat(coalesce(l.google_place_name, '') || ' ' || l.google_maps_query, ' ')
      FROM city_card_locations l WHERE l.card_id = c.id), '')) AS locations,
  trim(c.start_location_name || ' ' || c.start_location) AS origin,
  trim(c.end_location_name || ' ' || c.end_location) AS destination
FROM cards c;

CREATE VIRTUAL TABLE card_search USING fts5(
  title, description, locations, origin, destination,
  tokenize = 'unicode61 remove_diacritics 2', prefix = '2 3'
);
INSERT INTO card_search(rowid, title, description, locations, origin, destination)
SELECT rowid, title, description, locations, origin, destination FROM card_search_documents;

CREATE TRIGGER cards_search_insert AFTER INSERT ON cards BEGIN
  INSERT INTO card_search(rowid, title, description, locations, origin, destination)
  SELECT rowid, title, description, locations, origin, destination
  FROM card_search_documents WHERE rowid = new.rowid;
END;
CREATE TRIGGER cards_search_delete AFTER DELETE ON cards BEGIN
  DELETE FROM card_search WHERE rowid = old.rowid;
END;
CREATE TRIGGER cards_search_update AFTER UPDATE OF title, description, google_place_name,
  google_maps_query, start_location_name, start_location, end_location_name, end_location ON cards BEGIN
  DELETE FROM card_search WHERE rowid = old.rowid;
  INSERT INTO card_search(rowid, title, description, locations, origin, destination)
  SELECT rowid, title, description, locations, origin, destination
  FROM card_search_documents WHERE rowid = new.rowid;
END;

CREATE TRIGGER city_locations_search_insert AFTER INSERT ON city_card_locations BEGIN
  UPDATE card_search SET locations = (SELECT locations FROM card_search_documents WHERE rowid = card_search.rowid)
  WHERE rowid = (SELECT rowid FROM cards WHERE id = new.card_id);
END;
CREATE TRIGGER city_locations_search_delete AFTER DELETE ON city_card_locations BEGIN
  UPDATE card_search SET locations = (SELECT locations FROM card_search_documents WHERE rowid = card_search.rowid)
  WHERE rowid = (SELECT rowid FROM cards WHERE id = old.card_id);
END;
CREATE TRIGGER city_locations_search_update AFTER UPDATE OF card_id, google_place_name, google_maps_query ON city_card_locations BEGIN
  UPDATE card_search SET locations = (SELECT locations FROM card_search_documents WHERE rowid = card_search.rowid)
  WHERE rowid IN (SELECT rowid FROM cards WHERE id IN (old.card_id, new.card_id));
END;
