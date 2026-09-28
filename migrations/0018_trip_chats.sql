-- Private conversations; trip snapshots contain shared trip data only.
CREATE TABLE trip_chats (
  trip_id TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  messages TEXT NOT NULL DEFAULT '[]',
  lock_id TEXT,
  locked_until INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (trip_id, user_id)
);
CREATE INDEX trip_chats_user_idx ON trip_chats(user_id);
CREATE TABLE trip_chat_contexts (
  trip_id TEXT PRIMARY KEY NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  revision INTEGER NOT NULL DEFAULT 0,
  context TEXT
);

-- Revision fencing prevents a snapshot loaded during an edit from being cached.
-- Updating both old and new owners also covers moving records between parents.
CREATE TRIGGER trip_chat_trips_insert AFTER INSERT ON trips
BEGIN
  UPDATE trip_chat_contexts SET revision = revision + 1, context = NULL WHERE trip_id IN (NEW.id);
END;
CREATE TRIGGER trip_chat_trips_update AFTER UPDATE ON trips
BEGIN
  UPDATE trip_chat_contexts SET revision = revision + 1, context = NULL WHERE trip_id IN (OLD.id, NEW.id);
END;
CREATE TRIGGER trip_chat_trips_delete AFTER DELETE ON trips
BEGIN
  UPDATE trip_chat_contexts SET revision = revision + 1, context = NULL WHERE trip_id IN (OLD.id);
END;
CREATE TRIGGER trip_chat_trip_days_insert AFTER INSERT ON trip_days
BEGIN
  UPDATE trip_chat_contexts SET revision = revision + 1, context = NULL WHERE trip_id IN (NEW.trip_id);
END;
CREATE TRIGGER trip_chat_trip_days_update AFTER UPDATE ON trip_days
BEGIN
  UPDATE trip_chat_contexts SET revision = revision + 1, context = NULL WHERE trip_id IN (OLD.trip_id, NEW.trip_id);
END;
CREATE TRIGGER trip_chat_trip_days_delete AFTER DELETE ON trip_days
BEGIN
  UPDATE trip_chat_contexts SET revision = revision + 1, context = NULL WHERE trip_id IN (OLD.trip_id);
END;
CREATE TRIGGER trip_chat_cards_insert AFTER INSERT ON cards
BEGIN
  UPDATE trip_chat_contexts SET revision = revision + 1, context = NULL WHERE trip_id IN (NEW.trip_id);
END;
CREATE TRIGGER trip_chat_cards_update AFTER UPDATE ON cards
BEGIN
  UPDATE trip_chat_contexts SET revision = revision + 1, context = NULL WHERE trip_id IN (OLD.trip_id, NEW.trip_id);
END;
CREATE TRIGGER trip_chat_cards_delete AFTER DELETE ON cards
BEGIN
  UPDATE trip_chat_contexts SET revision = revision + 1, context = NULL WHERE trip_id IN (OLD.trip_id);
END;
CREATE TRIGGER trip_chat_trip_notes_insert AFTER INSERT ON trip_notes
BEGIN
  UPDATE trip_chat_contexts SET revision = revision + 1, context = NULL WHERE trip_id IN (NEW.trip_id);
END;
CREATE TRIGGER trip_chat_trip_notes_update AFTER UPDATE ON trip_notes
BEGIN
  UPDATE trip_chat_contexts SET revision = revision + 1, context = NULL WHERE trip_id IN (OLD.trip_id, NEW.trip_id);
END;
CREATE TRIGGER trip_chat_trip_notes_delete AFTER DELETE ON trip_notes
BEGIN
  UPDATE trip_chat_contexts SET revision = revision + 1, context = NULL WHERE trip_id IN (OLD.trip_id);
END;
CREATE TRIGGER trip_chat_trip_todos_insert AFTER INSERT ON trip_todos
BEGIN
  UPDATE trip_chat_contexts SET revision = revision + 1, context = NULL WHERE trip_id IN (NEW.trip_id);
END;
CREATE TRIGGER trip_chat_trip_todos_update AFTER UPDATE ON trip_todos
BEGIN
  UPDATE trip_chat_contexts SET revision = revision + 1, context = NULL WHERE trip_id IN (OLD.trip_id, NEW.trip_id);
END;
CREATE TRIGGER trip_chat_trip_todos_delete AFTER DELETE ON trip_todos
BEGIN
  UPDATE trip_chat_contexts SET revision = revision + 1, context = NULL WHERE trip_id IN (OLD.trip_id);
END;
CREATE TRIGGER trip_chat_accommodation_places_insert AFTER INSERT ON accommodation_places
BEGIN
  UPDATE trip_chat_contexts SET revision = revision + 1, context = NULL WHERE trip_id IN (NEW.trip_id);
END;
CREATE TRIGGER trip_chat_accommodation_places_update AFTER UPDATE ON accommodation_places
BEGIN
  UPDATE trip_chat_contexts SET revision = revision + 1, context = NULL WHERE trip_id IN (OLD.trip_id, NEW.trip_id);
END;
CREATE TRIGGER trip_chat_accommodation_places_delete AFTER DELETE ON accommodation_places
BEGIN
  UPDATE trip_chat_contexts SET revision = revision + 1, context = NULL WHERE trip_id IN (OLD.trip_id);
END;
CREATE TRIGGER trip_chat_accommodations_insert AFTER INSERT ON accommodations
BEGIN
  UPDATE trip_chat_contexts SET revision = revision + 1, context = NULL WHERE trip_id IN ((SELECT trip_id FROM accommodation_places WHERE id = NEW.place_id));
END;
CREATE TRIGGER trip_chat_accommodations_update AFTER UPDATE ON accommodations
BEGIN
  UPDATE trip_chat_contexts SET revision = revision + 1, context = NULL WHERE trip_id IN ((SELECT trip_id FROM accommodation_places WHERE id = OLD.place_id), (SELECT trip_id FROM accommodation_places WHERE id = NEW.place_id));
END;
CREATE TRIGGER trip_chat_accommodations_delete AFTER DELETE ON accommodations
BEGIN
  UPDATE trip_chat_contexts SET revision = revision + 1, context = NULL WHERE trip_id IN ((SELECT trip_id FROM accommodation_places WHERE id = OLD.place_id));
END;
CREATE TRIGGER trip_chat_city_card_locations_insert AFTER INSERT ON city_card_locations
BEGIN
  UPDATE trip_chat_contexts SET revision = revision + 1, context = NULL WHERE trip_id IN ((SELECT trip_id FROM cards WHERE id = NEW.card_id));
END;
CREATE TRIGGER trip_chat_city_card_locations_update AFTER UPDATE ON city_card_locations
BEGIN
  UPDATE trip_chat_contexts SET revision = revision + 1, context = NULL WHERE trip_id IN ((SELECT trip_id FROM cards WHERE id = OLD.card_id), (SELECT trip_id FROM cards WHERE id = NEW.card_id));
END;
CREATE TRIGGER trip_chat_city_card_locations_delete AFTER DELETE ON city_card_locations
BEGIN
  UPDATE trip_chat_contexts SET revision = revision + 1, context = NULL WHERE trip_id IN ((SELECT trip_id FROM cards WHERE id = OLD.card_id));
END;
