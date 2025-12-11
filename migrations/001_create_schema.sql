-- migrations/001_create_schema.sql
-- MySQL 8+ schema for double-entry ledger (accounts, transactions, immutable ledger entries)
-- Use utf8mb4 for all text columns.

-- 1) Create database if not exists and switch to it
CREATE DATABASE IF NOT EXISTS ledger_db
  CHARACTER SET = 'utf8mb4'
  COLLATE = 'utf8mb4_unicode_ci';
USE ledger_db;

-- 2) app_user table (minimal)
CREATE TABLE IF NOT EXISTS app_user (
  id CHAR(36) NOT NULL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL UNIQUE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3) account table
CREATE TABLE IF NOT EXISTS account (
  id CHAR(36) NOT NULL PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  account_type VARCHAR(50) NOT NULL,
  currency CHAR(3) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  metadata JSON DEFAULT (JSON_OBJECT()),
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_account_user FOREIGN KEY (user_id) REFERENCES app_user(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4) money_transaction (transaction intent)
CREATE TABLE IF NOT EXISTS money_transaction (
  id CHAR(36) NOT NULL PRIMARY KEY,
  transaction_type VARCHAR(20) NOT NULL,
  source_account_id CHAR(36) NULL,
  destination_account_id CHAR(36) NULL,
  amount DECIMAL(24,8) NOT NULL CHECK (amount > 0),
  currency CHAR(3) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  reference VARCHAR(255) NULL,
  description TEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMP NULL,
  CONSTRAINT fk_tx_source_account FOREIGN KEY (source_account_id) REFERENCES account(id) ON DELETE SET NULL,
  CONSTRAINT fk_tx_destination_account FOREIGN KEY (destination_account_id) REFERENCES account(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 5) ledger_entry (immutable, append-only)
CREATE TABLE IF NOT EXISTS ledger_entry (
  id CHAR(36) NOT NULL PRIMARY KEY,
  account_id CHAR(36) NOT NULL,
  transaction_id CHAR(36) NOT NULL,
  entry_type ENUM('debit','credit') NOT NULL,
  amount DECIMAL(24,8) NOT NULL CHECK (amount >= 0),
  currency CHAR(3) NOT NULL,
  note TEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_ledger_account FOREIGN KEY (account_id) REFERENCES account(id) ON DELETE CASCADE,
  CONSTRAINT fk_ledger_transaction FOREIGN KEY (transaction_id) REFERENCES money_transaction(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------------------
-- 6) Indexes (SAFE FOR ALL MYSQL VERSIONS)
-- --------------------------------------------------------------------

-- idx_ledger_account_created_at
SET @exists := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = 'ledger_db'
    AND TABLE_NAME = 'ledger_entry'
    AND INDEX_NAME = 'idx_ledger_account_created_at'
);
SET @sql = IF(
  @exists = 0,
  'CREATE INDEX idx_ledger_account_created_at ON ledger_entry (account_id, created_at DESC)',
  'SELECT "index idx_ledger_account_created_at already exists"'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- idx_ledger_tx
SET @exists := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = 'ledger_db'
    AND TABLE_NAME = 'ledger_entry'
    AND INDEX_NAME = 'idx_ledger_tx'
);
SET @sql = IF(
  @exists = 0,
  'CREATE INDEX idx_ledger_tx ON ledger_entry (transaction_id)',
  'SELECT "index idx_ledger_tx already exists"'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- idx_account_user
SET @exists := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = 'ledger_db'
    AND TABLE_NAME = 'account'
    AND INDEX_NAME = 'idx_account_user'
);
SET @sql = IF(
  @exists = 0,
  'CREATE INDEX idx_account_user ON account (user_id)',
  'SELECT "index idx_account_user already exists"'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- --------------------------------------------------------------------
-- 7) SYSTEM USER + SYSTEM CLEARING ACCOUNT
-- --------------------------------------------------------------------

INSERT IGNORE INTO app_user (id, name, email, created_at)
VALUES ('00000000-0000-0000-0000-000000000000', 'SYSTEM', 'system@ledger.local', NOW());

INSERT IGNORE INTO account (id, user_id, account_type, currency, status, metadata, created_at)
VALUES (
  '11111111-1111-1111-1111-111111111111',
  '00000000-0000-0000-0000-000000000000',
  'system_clearing',
  'USD',
  'active',
  JSON_OBJECT('note', 'System clearing account for external deposits/withdrawals'),
  NOW()
);

-- --------------------------------------------------------------------
-- 8) VIEW: account_balances
-- --------------------------------------------------------------------

DROP VIEW IF EXISTS account_balances;

CREATE VIEW account_balances AS
SELECT
  a.id AS account_id,
  a.user_id,
  a.account_type,
  a.currency,
  COALESCE(SUM(CASE WHEN le.entry_type = 'credit' THEN le.amount ELSE -le.amount END), 0.0) AS balance
FROM account a
LEFT JOIN ledger_entry le ON le.account_id = a.id
GROUP BY a.id, a.user_id, a.account_type, a.currency;

-- --------------------------------------------------------------------
-- 9) Immutability triggers on ledger_entry
-- --------------------------------------------------------------------

DELIMITER $$

CREATE TRIGGER ledger_entry_no_update
BEFORE UPDATE ON ledger_entry
FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000'
  SET MESSAGE_TEXT = 'ledger_entry is immutable - updates not allowed';
END$$

CREATE TRIGGER ledger_entry_no_delete
BEFORE DELETE ON ledger_entry
FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000'
  SET MESSAGE_TEXT = 'ledger_entry is immutable - deletes not allowed';
END$$

DELIMITER ;

-- --------------------------------------------------------------------
-- 10) Notes
-- --------------------------------------------------------------------
-- - IDs are CHAR(36) UUIDs.
-- - Ledger entries are append-only.
-- - For reversals create compensating ledger entries.
-- - Triggers enforce immutability at DB level.
