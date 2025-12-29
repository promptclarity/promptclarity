import { Migration } from './migration-runner';

/**
 * Migration 011: Add Users Table for Authentication
 * Date: 2025-11-26
 * Description: Creates the users table and links businesses to users
 */
export const migration_011: Migration = {
  id: 11,
  name: 'add_users',

  up: (db) => {
    db.exec(`
      -- Users table for authentication
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        name TEXT,
        email TEXT UNIQUE NOT NULL,
        email_verified DATETIME,
        image TEXT,
        password TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      -- Accounts table for OAuth providers
      CREATE TABLE IF NOT EXISTS accounts (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        type TEXT NOT NULL,
        provider TEXT NOT NULL,
        provider_account_id TEXT NOT NULL,
        refresh_token TEXT,
        access_token TEXT,
        expires_at INTEGER,
        token_type TEXT,
        scope TEXT,
        id_token TEXT,
        session_state TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        UNIQUE(provider, provider_account_id)
      );

      -- Sessions table
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        session_token TEXT UNIQUE NOT NULL,
        user_id TEXT NOT NULL,
        expires DATETIME NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );

      -- Verification tokens for email verification
      CREATE TABLE IF NOT EXISTS verification_tokens (
        identifier TEXT NOT NULL,
        token TEXT NOT NULL,
        expires DATETIME NOT NULL,
        PRIMARY KEY (identifier, token)
      );

      -- Add user_id to businesses table
      ALTER TABLE businesses ADD COLUMN user_id TEXT REFERENCES users(id) ON DELETE CASCADE;

      -- Create indexes
      CREATE INDEX IF NOT EXISTS idx_accounts_user_id ON accounts(user_id);
      CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
      CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(session_token);
      CREATE INDEX IF NOT EXISTS idx_businesses_user_id ON businesses(user_id);
    `);
  },

  down: (db) => {
    db.exec(`
      DROP INDEX IF EXISTS idx_businesses_user_id;
      DROP INDEX IF EXISTS idx_sessions_token;
      DROP INDEX IF EXISTS idx_sessions_user_id;
      DROP INDEX IF EXISTS idx_accounts_user_id;

      -- Remove user_id from businesses (SQLite doesn't support DROP COLUMN in older versions)
      -- We'll recreate the table without the column

      DROP TABLE IF EXISTS verification_tokens;
      DROP TABLE IF EXISTS sessions;
      DROP TABLE IF EXISTS accounts;
      DROP TABLE IF EXISTS users;
    `);
  }
};
