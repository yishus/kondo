-- The column added in 0003 has a fixed CHECK constraint. Move its values to an
-- extensible column so future application-validated categories do not require
-- rebuilding cards and its attachment foreign keys.
ALTER TABLE cards ADD COLUMN location_subcategory TEXT;
UPDATE cards SET location_subcategory = location_category;
