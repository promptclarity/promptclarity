#!/usr/bin/env node

const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(process.cwd(), 'data', 'store.db'));

console.log('Starting migration: Renaming ai_models to platforms...');

try {
  db.pragma('foreign_keys = OFF');
  
  db.transaction(() => {
    // 1. Create new platforms table
    db.exec(`
      CREATE TABLE IF NOT EXISTS platforms (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        business_id INTEGER NOT NULL,
        provider TEXT NOT NULL,
        model_name TEXT NOT NULL,
        api_key TEXT NOT NULL,
        is_primary BOOLEAN DEFAULT 0,
        is_active BOOLEAN DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE,
        UNIQUE(business_id, provider)
      );
    `);
    
    // 2. Copy data from ai_models to platforms
    const aiModelsExist = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='ai_models'").get();
    
    if (aiModelsExist) {
      console.log('Copying data from ai_models to platforms...');
      
      // Copy data, keeping only one per provider per business
      db.exec(`
        INSERT INTO platforms (id, business_id, provider, model_name, api_key, is_primary, is_active, created_at, updated_at)
        SELECT 
          id, 
          business_id, 
          provider, 
          model_name, 
          api_key, 
          is_primary, 
          is_active, 
          created_at, 
          updated_at
        FROM ai_models
        WHERE id IN (
          SELECT MIN(id)
          FROM ai_models
          GROUP BY business_id, provider
        )
      `);
      
      // 3. Update prompt_executions to reference platforms
      db.exec(`
        CREATE TABLE IF NOT EXISTS prompt_executions_new (
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
          FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE,
          FOREIGN KEY (prompt_id) REFERENCES prompts(id) ON DELETE CASCADE,
          FOREIGN KEY (platform_id) REFERENCES platforms(id) ON DELETE CASCADE
        );
      `);
      
      // Copy data from old prompt_executions
      db.exec(`
        INSERT INTO prompt_executions_new (id, business_id, prompt_id, platform_id, status, result, error_message, started_at, completed_at, created_at)
        SELECT 
          pe.id, 
          pe.business_id, 
          pe.prompt_id, 
          pe.ai_model_id as platform_id, 
          pe.status, 
          pe.result, 
          pe.error_message, 
          pe.started_at, 
          pe.completed_at, 
          pe.created_at
        FROM prompt_executions pe
        WHERE pe.ai_model_id IN (SELECT id FROM platforms)
      `);
      
      // Drop old table and rename new one
      db.exec(`DROP TABLE IF EXISTS prompt_executions`);
      db.exec(`ALTER TABLE prompt_executions_new RENAME TO prompt_executions`);
      
      // 4. Create indexes for prompt_executions
      db.exec(`
        CREATE INDEX IF NOT EXISTS idx_prompt_executions_business ON prompt_executions(business_id);
        CREATE INDEX IF NOT EXISTS idx_prompt_executions_prompt ON prompt_executions(prompt_id);
        CREATE INDEX IF NOT EXISTS idx_prompt_executions_platform ON prompt_executions(platform_id);
        CREATE INDEX IF NOT EXISTS idx_prompt_executions_status ON prompt_executions(status);
      `);
      
      // 5. Drop the old ai_models table
      db.exec(`DROP TABLE IF EXISTS ai_models`);
      
      console.log('Migration completed successfully!');
    } else {
      console.log('ai_models table does not exist, creating platforms table only...');
    }
  })();
  
  db.pragma('foreign_keys = ON');
  
  // Show current schema
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all();
  console.log('\nCurrent tables:', tables.map(t => t.name).join(', '));
  
  // Show platforms count
  const platformCount = db.prepare('SELECT COUNT(*) as count FROM platforms').get();
  console.log(`Total platforms: ${platformCount.count}`);
  
  // Show unique platforms per business
  const uniquePlatforms = db.prepare(`
    SELECT business_id, GROUP_CONCAT(provider) as providers 
    FROM platforms 
    GROUP BY business_id
  `).all();
  console.log('\nPlatforms per business:');
  uniquePlatforms.forEach(row => {
    console.log(`  Business ${row.business_id}: ${row.providers}`);
  });
  
} catch (error) {
  console.error('Migration failed:', error);
  process.exit(1);
} finally {
  db.close();
}

console.log('\nMigration completed!');