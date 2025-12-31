const Database = require('better-sqlite3');
const path = require('path');

// Open the database
const dbPath = path.join(__dirname, '..', 'data', 'store.db');
const db = new Database(dbPath);

try {
  console.log('Updating platforms table constraint...');
  
  // Check current table structure
  const tableInfo = db.prepare("PRAGMA table_info(platforms)").all();
  console.log('Current platforms table columns:', tableInfo.map(col => col.name).join(', '));
  
  // Get current data
  const platforms = db.prepare('SELECT * FROM platforms').all();
  console.log(`Found ${platforms.length} existing platforms`);
  
  // Start transaction
  db.exec('BEGIN TRANSACTION');
  
  try {
    // Create new table with updated constraint
    db.exec(`
      CREATE TABLE IF NOT EXISTS platforms_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        business_id INTEGER NOT NULL,
        name TEXT,
        provider TEXT NOT NULL,
        model_name TEXT NOT NULL,
        api_key TEXT NOT NULL,
        is_primary BOOLEAN DEFAULT 0,
        is_active BOOLEAN DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE,
        UNIQUE(business_id, name)
      )
    `);
    
    // Copy data from old table to new table
    db.exec(`
      INSERT INTO platforms_new (id, business_id, name, provider, model_name, api_key, is_primary, is_active, created_at, updated_at)
      SELECT id, business_id, name, provider, model_name, api_key, is_primary, is_active, created_at, updated_at
      FROM platforms
    `);
    
    // Drop old table
    db.exec('DROP TABLE platforms');
    
    // Rename new table to original name
    db.exec('ALTER TABLE platforms_new RENAME TO platforms');
    
    // Commit transaction
    db.exec('COMMIT');
    
    console.log('✓ Successfully updated platforms table constraint');
    
    // Verify the change
    const indexes = db.prepare("PRAGMA index_list(platforms)").all();
    console.log('\nTable indexes:', indexes);
    
    // Show current platforms
    const updatedPlatforms = db.prepare('SELECT business_id, name, provider FROM platforms').all();
    console.log('\nCurrent platforms:');
    updatedPlatforms.forEach(p => {
      console.log(`  Business ${p.business_id}: ${p.name} (${p.provider})`);
    });
    
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
  
} catch (error) {
  console.error('Error updating platforms constraint:', error);
} finally {
  db.close();
}