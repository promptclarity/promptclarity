const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const yaml = require('js-yaml');

// Open the database
const dbPath = path.join(__dirname, '..', 'data', 'store.db');
const db = new Database(dbPath);

// Load platform configs to map providers to platform IDs
// Use the static configuration for migration
const platformConfigs = {
  chatgpt: { provider: 'openai', name: 'ChatGPT', model: 'gpt-4o' },
  claude: { provider: 'anthropic', name: 'Anthropic Claude', model: 'claude-opus-4-20250514' },
  gemini: { provider: 'google', name: 'Google Gemini', model: 'gemini-2.5-pro' },
  perplexity: { provider: 'perplexity', name: 'Perplexity', model: 'sonar-deep-research' },
  grok: { provider: 'xai', name: 'Grok', model: 'grok-4-latest' }
};

// Create a map from provider to platform_id
const providerToPlatformId = {};
Object.entries(platformConfigs).forEach(([id, config]) => {
  providerToPlatformId[config.provider] = id;
});

console.log('Provider to Platform ID mapping:', providerToPlatformId);

try {
  console.log('Migrating platforms table to business_platforms...');
  
  // Check if platforms table exists
  const tableExists = db.prepare(`
    SELECT name FROM sqlite_master 
    WHERE type='table' AND name='platforms'
  `).get();
  
  if (!tableExists) {
    console.log('Platforms table does not exist, creating business_platforms directly...');
    
    // Create business_platforms table directly
    db.exec(`
      CREATE TABLE IF NOT EXISTS business_platforms (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        business_id INTEGER NOT NULL,
        platform_id TEXT NOT NULL,
        name TEXT,
        provider TEXT NOT NULL,
        model_name TEXT NOT NULL,
        api_key TEXT NOT NULL,
        is_primary BOOLEAN DEFAULT 0,
        is_active BOOLEAN DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE,
        UNIQUE(business_id, platform_id)
      )
    `);
    
    console.log('✓ Created business_platforms table');
  } else {
    // Get current data
    const platforms = db.prepare('SELECT * FROM platforms').all();
    console.log(`Found ${platforms.length} existing platforms to migrate`);
    
    // Start transaction
    db.exec('BEGIN TRANSACTION');
    
    try {
      // Create new table with platform_id
      db.exec(`
        CREATE TABLE IF NOT EXISTS business_platforms (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          business_id INTEGER NOT NULL,
          platform_id TEXT NOT NULL,
          name TEXT,
          provider TEXT NOT NULL,
          model_name TEXT NOT NULL,
          api_key TEXT NOT NULL,
          is_primary BOOLEAN DEFAULT 0,
          is_active BOOLEAN DEFAULT 1,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE,
          UNIQUE(business_id, platform_id)
        )
      `);
      
      // Migrate data with platform_id
      const insertStmt = db.prepare(`
        INSERT INTO business_platforms (
          id, business_id, platform_id, name, provider, model_name, 
          api_key, is_primary, is_active, created_at, updated_at
        ) VALUES (
          @id, @business_id, @platform_id, @name, @provider, @model_name, 
          @api_key, @is_primary, @is_active, @created_at, @updated_at
        )
      `);
      
      for (const platform of platforms) {
        const platform_id = providerToPlatformId[platform.provider];
        if (!platform_id) {
          console.warn(`Warning: No platform_id found for provider ${platform.provider}, using provider as platform_id`);
        }
        
        insertStmt.run({
          ...platform,
          platform_id: platform_id || platform.provider
        });
      }
      
      // Update prompt_executions to reference business_platforms
      // First check if the column name needs updating
      const peColumns = db.prepare("PRAGMA table_info(prompt_executions)").all();
      const hasPlatformId = peColumns.some(col => col.name === 'platform_id');
      
      if (hasPlatformId) {
        console.log('prompt_executions already uses platform_id column');
      }
      
      // Drop old platforms table
      db.exec('DROP TABLE platforms');
      
      // Commit transaction
      db.exec('COMMIT');
      
      console.log('✓ Successfully migrated to business_platforms table');
      
      // Show migrated data
      const businessPlatforms = db.prepare('SELECT business_id, platform_id, name, provider FROM business_platforms').all();
      console.log('\nMigrated business platforms:');
      businessPlatforms.forEach(p => {
        console.log(`  Business ${p.business_id}: ${p.platform_id} - ${p.name} (${p.provider})`);
      });
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }
  
  // Create indexes
  console.log('\nCreating indexes...');
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_business_platforms_business ON business_platforms(business_id);
    CREATE INDEX IF NOT EXISTS idx_business_platforms_platform ON business_platforms(platform_id);
  `);
  console.log('✓ Indexes created');
  
} catch (error) {
  console.error('Error during migration:', error);
} finally {
  db.close();
}