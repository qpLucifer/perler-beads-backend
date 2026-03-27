-- Migration: align cart/address/order schema with latest routes
-- Run command:
-- mysql -u root -p perler_beads < database/migration_schema_2026_03_25.sql

-- 1) cart supports both artworks and products
ALTER TABLE cart
  ADD COLUMN IF NOT EXISTS artwork_id INT NULL AFTER user_id;

ALTER TABLE cart
  MODIFY COLUMN product_id INT NULL;

-- Ensure indexes exist
CREATE INDEX idx_artwork_id ON cart (artwork_id);
CREATE INDEX idx_product_id ON cart (product_id);

-- Ensure foreign key for artwork exists (ignore if already exists)
ALTER TABLE cart
  ADD CONSTRAINT fk_cart_artwork FOREIGN KEY (artwork_id) REFERENCES artworks(id) ON DELETE CASCADE;

-- 2) addresses column compatibility (older schema uses receiver_* names)
ALTER TABLE addresses
  ADD COLUMN IF NOT EXISTS name VARCHAR(50) NULL,
  ADD COLUMN IF NOT EXISTS phone VARCHAR(20) NULL,
  ADD COLUMN IF NOT EXISTS detail VARCHAR(255) NULL;

UPDATE addresses
SET
  name = COALESCE(name, receiver_name),
  phone = COALESCE(phone, receiver_phone),
  detail = COALESCE(detail, detail_address);

-- 3) order_items supports artwork lines
ALTER TABLE order_items
  MODIFY COLUMN product_id INT NULL,
  ADD COLUMN IF NOT EXISTS artwork_id INT NULL AFTER product_id;

ALTER TABLE order_items
  ADD CONSTRAINT fk_order_items_artwork FOREIGN KEY (artwork_id) REFERENCES artworks(id) ON DELETE SET NULL;
