const Database = require('better-sqlite3');
const path = require('path');

// Open the database
const dbPath = path.join(__dirname, '..', 'data', 'store.db');
const db = new Database(dbPath);

try {
  console.log('Adding competitor_share_of_voice field to prompt_executions table...\n');
  
  // Add competitor_share_of_voice column to store JSON with each competitor's SOV
  try {
    db.exec(`ALTER TABLE prompt_executions ADD COLUMN competitor_share_of_voice TEXT`);
    console.log('✓ Added competitor_share_of_voice column');
  } catch (err) {
    if (err.message.includes('duplicate column name')) {
      console.log('⊘ competitor_share_of_voice column already exists');
    } else {
      throw err;
    }
  }
  
  console.log('\n✓ Database schema updated successfully');
  
  // Show the updated schema
  const tableInfo = db.prepare('PRAGMA table_info(prompt_executions)').all();
  console.log('\nShare of Voice related columns:');
  const relevantColumns = tableInfo.filter(col => 
    col.name.includes('share_of_voice') || 
    col.name.includes('visibility')
  );
  relevantColumns.forEach(col => {
    console.log(`  ${col.name}: ${col.type}${col.notnull ? ' NOT NULL' : ''}${col.dflt_value ? ` DEFAULT ${col.dflt_value}` : ''}`);
  });
  
} catch (error) {
  console.error('Error updating database schema:', error);
  process.exit(1);
} finally {
  db.close();
}