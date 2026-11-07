-- Poster orders. Apply with:
--   npx wrangler d1 execute poster_orders --remote --file=schema.sql
-- Status runs pending (made in the app) -> paid (Stripe) -> submitted (Prodigi)
-- -> shipped, or failed at any point after payment.
CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,          -- random and unguessable: the app's handle on its order
  ref TEXT NOT NULL UNIQUE,     -- RA-7F3K2, shown to the customer
  status TEXT NOT NULL,
  size TEXT NOT NULL,           -- A3 or A2
  edition TEXT NOT NULL,        -- route or photo
  title TEXT,
  has_photo INTEGER NOT NULL DEFAULT 0,
  stripe_session TEXT UNIQUE,
  email TEXT,                   -- cleared 60 days after ordering
  name TEXT,
  prodigi_id TEXT UNIQUE,
  tracking_url TEXT,
  error TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS orders_created ON orders (created_at);
