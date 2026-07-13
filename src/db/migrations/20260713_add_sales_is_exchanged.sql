ALTER TABLE sales
ADD COLUMN IF NOT EXISTS is_exchanged boolean NOT NULL DEFAULT false;
