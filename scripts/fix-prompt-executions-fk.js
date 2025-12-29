const Database = require('better-sqlite3');
const path = require('path');

// Open the database
const dbPath = path.join(__dirname, '..', 'data', 'store.db');
const db = new Database(dbPath);

try {
  console.log('Fixing prompt_executions foreign key constraint...');
  
  // Start transaction
  db.exec('BEGIN TRANSACTION');
  
  try {
    // Get existing data
    const executions = db.prepare('SELECT * FROM prompt_executions').all();
    console.log(`Found ${executions.length} prompt executions to preserve`);
    
    // Drop the old table
    db.exec('DROP TABLE IF EXISTS prompt_executions');
    
    // Create new table with correct foreign key
    db.exec(`
      CREATE TABLE prompt_executions (
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
        FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE,
        FOREIGN KEY (prompt_id) REFERENCES prompts(id) ON DELETE CASCADE,
        FOREIGN KEY (platform_id) REFERENCES business_platforms(id) ON DELETE CASCADE
      )
    `);
    
    // Create indexes
    db.exec(`
      CREATE INDEX idx_prompt_executions_business ON prompt_executions(business_id);
      CREATE INDEX idx_prompt_executions_prompt ON prompt_executions(prompt_id);
      CREATE INDEX idx_prompt_executions_platform ON prompt_executions(platform_id);
      CREATE INDEX idx_prompt_executions_status ON prompt_executions(status);
    `);
    
    // Restore data
    if (executions.length > 0) {
      const insertStmt = db.prepare(`
        INSERT INTO prompt_executions (
          id, business_id, prompt_id, platform_id, status, result, error_message,
          started_at, completed_at, created_at, refresh_date, brand_mentions,
          competitors_mentioned, mention_analysis, analysis_confidence,
          business_visibility, share_of_voice, competitor_share_of_voice,
          competitor_visibilities
        ) VALUES (
          @id, @business_id, @prompt_id, @platform_id, @status, @result, @error_message,
          @started_at, @completed_at, @created_at, @refresh_date, @brand_mentions,
          @competitors_mentioned, @mention_analysis, @analysis_confidence,
          @business_visibility, @share_of_voice, @competitor_share_of_voice,
          @competitor_visibilities
        )
      `);
      
      for (const execution of executions) {
        insertStmt.run(execution);
      }
      
      console.log(`✓ Restored ${executions.length} prompt executions`);
    }
    
    // Commit transaction
    db.exec('COMMIT');
    
    console.log('✓ Successfully fixed prompt_executions foreign key constraint');
    
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
  
} catch (error) {
  console.error('Error fixing foreign key:', error);
} finally {
  db.close();
}