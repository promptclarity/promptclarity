const Database = require('better-sqlite3');
const path = require('path');

// Open the database
const dbPath = path.join(__dirname, '..', 'data', 'store.db');
const db = new Database(dbPath);

try {
  // Add execution_date column for grouping executions by day
  const alterStatement = `ALTER TABLE prompt_executions ADD COLUMN execution_date DATE`;
  
  try {
    db.exec(alterStatement);
    console.log(`✓ Added execution_date column to prompt_executions table`);
  } catch (err) {
    if (err.message.includes('duplicate column name')) {
      console.log(`⊘ Column execution_date already exists`);
    } else {
      throw err;
    }
  }
  
  // Update existing records to set execution_date from completed_at
  const updateStatement = `
    UPDATE prompt_executions 
    SET execution_date = DATE(completed_at) 
    WHERE execution_date IS NULL AND completed_at IS NOT NULL
  `;
  
  const result = db.prepare(updateStatement).run();
  console.log(`✓ Updated ${result.changes} existing records with execution_date`);
  
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