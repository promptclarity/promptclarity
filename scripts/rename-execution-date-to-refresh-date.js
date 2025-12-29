const Database = require('better-sqlite3');
const path = require('path');

// Open the database
const dbPath = path.join(__dirname, '..', 'data', 'store.db');
const db = new Database(dbPath);

try {
  console.log('Starting migration: Renaming execution_date to refresh_date...\n');
  
  // SQLite doesn't support direct column rename with ALTER TABLE
  // We need to recreate the table or add a new column and copy data
  
  // Step 1: Add the new refresh_date column
  try {
    db.exec(`ALTER TABLE prompt_executions ADD COLUMN refresh_date DATE`);
    console.log('✓ Added refresh_date column');
  } catch (err) {
    if (err.message.includes('duplicate column name')) {
      console.log('⊘ refresh_date column already exists');
    } else {
      throw err;
    }
  }
  
  // Step 2: Copy data from execution_date to refresh_date
  const copyResult = db.prepare(`
    UPDATE prompt_executions 
    SET refresh_date = execution_date 
    WHERE execution_date IS NOT NULL AND refresh_date IS NULL
  `).run();
  
  console.log(`✓ Copied data to refresh_date column (${copyResult.changes} rows)`);
  
  // Step 3: For any remaining null refresh_date values, use the date from completed_at
  const fillResult = db.prepare(`
    UPDATE prompt_executions 
    SET refresh_date = DATE(completed_at) 
    WHERE refresh_date IS NULL AND completed_at IS NOT NULL
  `).run();
  
  console.log(`✓ Filled remaining refresh_date values from completed_at (${fillResult.changes} rows)`);
  
  // Step 4: Show statistics
  const stats = db.prepare(`
    SELECT 
      COUNT(*) as total,
      SUM(CASE WHEN refresh_date IS NOT NULL THEN 1 ELSE 0 END) as has_refresh_date,
      SUM(CASE WHEN execution_date IS NOT NULL THEN 1 ELSE 0 END) as has_execution_date,
      MIN(refresh_date) as earliest_date,
      MAX(refresh_date) as latest_date
    FROM prompt_executions
    WHERE status = 'completed'
  `).get();
  
  console.log('\n✓ Migration completed successfully!\n');
  console.log('Statistics:');
  console.log(`  Total completed executions: ${stats.total}`);
  console.log(`  Rows with refresh_date: ${stats.has_refresh_date}`);
  console.log(`  Rows with old execution_date: ${stats.has_execution_date}`);
  console.log(`  Date range: ${stats.earliest_date} to ${stats.latest_date}`);
  
  // Note: We're keeping the execution_date column for now to avoid breaking anything
  // It can be dropped later with a separate migration if needed
  console.log('\nNote: The old execution_date column has been preserved. It can be dropped in a future migration.');
  
} catch (error) {
  console.error('Error during migration:', error);
  process.exit(1);
} finally {
  db.close();
}