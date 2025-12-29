const Database = require('better-sqlite3');
const path = require('path');

// Open the database
const dbPath = path.join(__dirname, '..', 'data', 'store.db');
const db = new Database(dbPath);

try {
  // Add new columns for mention analysis
  const alterStatements = [
    `ALTER TABLE prompt_executions ADD COLUMN brand_mentions INTEGER DEFAULT 0`,
    `ALTER TABLE prompt_executions ADD COLUMN competitors_mentioned TEXT`,
    `ALTER TABLE prompt_executions ADD COLUMN mention_analysis TEXT`,
    `ALTER TABLE prompt_executions ADD COLUMN analysis_confidence REAL DEFAULT 0`
  ];
  
  for (const statement of alterStatements) {
    try {
      db.exec(statement);
      console.log(`✓ Executed: ${statement}`);
    } catch (err) {
      if (err.message.includes('duplicate column name')) {
        console.log(`⊘ Column already exists: ${statement.split('ADD COLUMN')[1].split(' ')[1]}`);
      } else {
        throw err;
      }
    }
  }
  
  console.log('\n✓ Database schema updated successfully');
  
  // Show the updated schema
  const tableInfo = db.prepare('PRAGMA table_info(prompt_executions)').all();
  console.log('\nUpdated prompt_executions schema:');
  tableInfo.forEach(col => {
    console.log(`  ${col.name}: ${col.type}${col.notnull ? ' NOT NULL' : ''}${col.dflt_value ? ` DEFAULT ${col.dflt_value}` : ''}`);
  });
  
} catch (error) {
  console.error('Error updating database schema:', error);
} finally {
  db.close();
}