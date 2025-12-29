import { Migration } from './migration-runner';

/**
 * Migration 001: Initial Schema
 * Date: 2025-11-21
 * Description: Creates the initial database schema with all base tables
 */
export const migration_001: Migration = {
  id: 1,
  name: 'initial_schema',

  up: (db) => {
    db.exec(`
      -- Businesses table
      CREATE TABLE IF NOT EXISTS businesses (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        business_name TEXT NOT NULL,
        website TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      -- Onboarding sessions
      CREATE TABLE IF NOT EXISTS onboarding_sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        business_id INTEGER NOT NULL,
        step_completed INTEGER DEFAULT 1,
        completed BOOLEAN DEFAULT 0,
        completed_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE
      );

      -- Topics
      CREATE TABLE IF NOT EXISTS topics (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        business_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        is_custom BOOLEAN DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE
      );

      -- Prompts
      CREATE TABLE IF NOT EXISTS prompts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        business_id INTEGER NOT NULL,
        topic_id INTEGER,
        text TEXT NOT NULL,
        is_custom BOOLEAN DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE,
        FOREIGN KEY (topic_id) REFERENCES topics(id) ON DELETE SET NULL
      );

      -- Competitors
      CREATE TABLE IF NOT EXISTS competitors (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        business_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        website TEXT,
        description TEXT,
        is_custom BOOLEAN DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE
      );

      -- Business Platforms (AI Models)
      CREATE TABLE IF NOT EXISTS business_platforms (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        business_id INTEGER NOT NULL,
        platform_id TEXT NOT NULL,
        api_key TEXT NOT NULL,
        is_primary BOOLEAN DEFAULT 0,
        is_active BOOLEAN DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE,
        UNIQUE(business_id, platform_id)
      );

      -- Prompt Executions
      CREATE TABLE IF NOT EXISTS prompt_executions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        business_id INTEGER NOT NULL,
        prompt_id INTEGER NOT NULL,
        platform_id INTEGER NOT NULL,
        status TEXT CHECK(status IN ('pending', 'running', 'completed', 'failed')) NOT NULL DEFAULT 'pending',
        result TEXT,
        error_message TEXT,
        started_at DATETIME,
        completed_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        refresh_date DATETIME,
        brand_mentions INTEGER DEFAULT 0,
        competitors_mentioned TEXT,
        mention_analysis TEXT,
        analysis_confidence REAL,
        business_visibility REAL,
        share_of_voice REAL,
        competitor_share_of_voice TEXT,
        competitor_visibilities TEXT,
        sources TEXT,
        FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE,
        FOREIGN KEY (prompt_id) REFERENCES prompts(id) ON DELETE CASCADE,
        FOREIGN KEY (platform_id) REFERENCES business_platforms(id) ON DELETE CASCADE
      );

      -- Indexes for performance
      CREATE INDEX IF NOT EXISTS idx_prompt_executions_business ON prompt_executions(business_id);
      CREATE INDEX IF NOT EXISTS idx_prompt_executions_prompt ON prompt_executions(prompt_id);
      CREATE INDEX IF NOT EXISTS idx_prompt_executions_platform ON prompt_executions(platform_id);
      CREATE INDEX IF NOT EXISTS idx_prompt_executions_refresh_date ON prompt_executions(refresh_date);
      CREATE INDEX IF NOT EXISTS idx_prompt_executions_status ON prompt_executions(status);
    `);
  },

  down: (db) => {
    db.exec(`
      DROP TABLE IF EXISTS prompt_executions;
      DROP TABLE IF EXISTS business_platforms;
      DROP TABLE IF EXISTS competitors;
      DROP TABLE IF EXISTS prompts;
      DROP TABLE IF EXISTS topics;
      DROP TABLE IF EXISTS onboarding_sessions;
      DROP TABLE IF EXISTS businesses;
    `);
  }
};
