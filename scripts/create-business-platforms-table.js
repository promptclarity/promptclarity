const Database = require('better-sqlite3');
const path = require('path');

// Open the database
const dbPath = path.join(__dirname, '..', 'data', 'store.db');
const db = new Database(dbPath);

try {
  console.log('Creating business_platforms table...');
  
  // Check if business_platforms table exists
  const tableExists = db.prepare(`
    SELECT name FROM sqlite_master 
    WHERE type='table' AND name='business_platforms'
  `).get();
  
  if (tableExists) {
    console.log('business_platforms table already exists');
  } else {
    // Create business_platforms table
    db.exec(`
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
      )
    `);
    
    console.log('✓ Created business_platforms table');
    
    // Create indexes
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_business_platforms_business ON business_platforms(business_id);
      CREATE INDEX IF NOT EXISTS idx_business_platforms_platform ON business_platforms(platform_id);
    `);
    
    console.log('✓ Created indexes');
  }
  
  // Check if old platforms table exists and has data
  const oldTableExists = db.prepare(`
    SELECT name FROM sqlite_master 
    WHERE type='table' AND name='platforms'
  `).get();
  
  if (oldTableExists) {
    console.log('Found old platforms table, checking for data...');
    
    const oldPlatforms = db.prepare('SELECT * FROM platforms').all();
    console.log(`Found ${oldPlatforms.length} rows in old platforms table`);
    
    if (oldPlatforms.length > 0) {
      console.log('Migrating data from platforms to business_platforms...');
      
      // Platform ID mapping
      const providerToPlatformId = {
        'openai': 'chatgpt',
        'anthropic': 'claude',
        'google': 'gemini',
        'perplexity': 'perplexity',
        'xai': 'grok'
      };
      
      const insertStmt = db.prepare(`
        INSERT OR IGNORE INTO business_platforms (
          business_id, platform_id, api_key, is_primary, is_active, created_at, updated_at
        ) VALUES (
          @business_id, @platform_id, @api_key, @is_primary, @is_active, @created_at, @updated_at
        )
      `);
      
      for (const platform of oldPlatforms) {
        const platform_id = providerToPlatformId[platform.provider] || platform.provider;
        
        try {
          insertStmt.run({
            business_id: platform.business_id,
            platform_id: platform_id,
            api_key: platform.api_key,
            is_primary: platform.is_primary || 0,
            is_active: platform.is_active || 1,
            created_at: platform.created_at,
            updated_at: platform.updated_at
          });
          console.log(`✓ Migrated platform ${platform_id} for business ${platform.business_id}`);
        } catch (err) {
          console.warn(`Warning: Could not migrate platform ${platform.id}:`, err.message);
        }
      }
      
      console.log('✓ Data migration complete');
      
      // Drop old table
      console.log('Dropping old platforms table...');
      db.exec('DROP TABLE platforms');
      console.log('✓ Old platforms table dropped');
    } else {
      // No data in old table, safe to drop
      console.log('Old platforms table is empty, dropping it...');
      db.exec('DROP TABLE platforms');
      console.log('✓ Old platforms table dropped');
    }
  } else {
    console.log('No old platforms table found');
  }
  
  // Show current state
  const businessPlatforms = db.prepare('SELECT * FROM business_platforms').all();
  console.log(`\nCurrent business_platforms table has ${businessPlatforms.length} rows`);
  
  if (businessPlatforms.length > 0) {
    console.log('Sample data:');
    businessPlatforms.slice(0, 3).forEach(p => {
      console.log(`  Business ${p.business_id}: ${p.platform_id} (primary: ${p.is_primary})`);
    });
  }
  
} catch (error) {
  console.error('Error:', error);
  process.exit(1);
} finally {
  db.close();
}

console.log('\n✓ Database setup complete');