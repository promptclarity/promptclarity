const Database = require('better-sqlite3');
const path = require('path');

// Open the database
const dbPath = path.join(__dirname, '..', 'data', 'store.db');
const db = new Database(dbPath);

try {
  console.log('Cleaning business_platforms table schema...');
  
  // Start transaction
  db.exec('BEGIN TRANSACTION');
  
  try {
    // Get existing data
    const existingData = db.prepare('SELECT * FROM business_platforms').all();
    console.log(`Found ${existingData.length} business platform configurations`);
    
    // Drop the old table
    db.exec('DROP TABLE IF EXISTS business_platforms');
    
    // Create new table with only necessary columns
    // platform_id references the platform config, no need to duplicate name, provider, model
    db.exec(`
      CREATE TABLE business_platforms (
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
    
    // Create indexes
    db.exec(`
      CREATE INDEX idx_business_platforms_business ON business_platforms(business_id);
      CREATE INDEX idx_business_platforms_platform ON business_platforms(platform_id);
    `);
    
    // Restore data (only the columns we need)
    if (existingData.length > 0) {
      const insertStmt = db.prepare(`
        INSERT INTO business_platforms (
          id, business_id, platform_id, api_key, is_primary, is_active, created_at, updated_at
        ) VALUES (
          @id, @business_id, @platform_id, @api_key, @is_primary, @is_active, @created_at, @updated_at
        )
      `);
      
      for (const row of existingData) {
        insertStmt.run({
          id: row.id,
          business_id: row.business_id,
          platform_id: row.platform_id,
          api_key: row.api_key,
          is_primary: row.is_primary,
          is_active: row.is_active,
          created_at: row.created_at,
          updated_at: row.updated_at
        });
      }
      
      console.log(`✓ Migrated ${existingData.length} platform configurations`);
    }
    
    // Commit transaction
    db.exec('COMMIT');
    
    console.log('✓ Successfully cleaned business_platforms schema');
    
    // Show the new schema
    const schemaInfo = db.prepare("PRAGMA table_info(business_platforms)").all();
    console.log('\nNew schema:');
    schemaInfo.forEach(col => {
      console.log(`  ${col.name}: ${col.type}${col.notnull ? ' NOT NULL' : ''}${col.dflt_value ? ` DEFAULT ${col.dflt_value}` : ''}`);
    });
    
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
  
} catch (error) {
  console.error('Error cleaning schema:', error);
} finally {
  db.close();
}