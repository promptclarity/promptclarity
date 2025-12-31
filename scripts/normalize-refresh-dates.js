const Database = require('better-sqlite3');
const path = require('path');

// Open the database
const dbPath = path.join(__dirname, '..', 'data', 'store.db');
const db = new Database(dbPath);

try {
  console.log('Normalizing refresh_date values to beginning of day...\n');
  
  // Get all prompt executions with refresh_date
  const executions = db.prepare(`
    SELECT id, refresh_date 
    FROM prompt_executions 
    WHERE refresh_date IS NOT NULL
  `).all();
  
  console.log(`Found ${executions.length} executions with refresh_date`);
  
  // Prepare update statement
  const updateStmt = db.prepare(`
    UPDATE prompt_executions 
    SET refresh_date = ? 
    WHERE id = ?
  `);
  
  // Start a transaction for better performance
  const updateAll = db.transaction(() => {
    let updated = 0;
    
    executions.forEach(exec => {
      // Parse the date and set to beginning of day (00:00:00.000)
      const date = new Date(exec.refresh_date);
      date.setHours(0, 0, 0, 0);
      const normalizedDate = date.toISOString().replace('T', ' ').replace('Z', '');
      
      // Only update if the value changed
      if (normalizedDate !== exec.refresh_date) {
        updateStmt.run(normalizedDate, exec.id);
        updated++;
      }
    });
    
    return updated;
  });
  
  const updatedCount = updateAll();
  
  console.log(`\n✓ Normalized ${updatedCount} refresh_date values to beginning of day`);
  
  // Show sample of updated data
  const samples = db.prepare(`
    SELECT id, refresh_date 
    FROM prompt_executions 
    WHERE refresh_date IS NOT NULL
    LIMIT 5
  `).all();
  
  console.log('\nSample normalized dates:');
  samples.forEach(s => {
    console.log(`  ID ${s.id}: ${s.refresh_date}`);
  });
  
} catch (error) {
  console.error('Error normalizing refresh dates:', error);
  process.exit(1);
} finally {
  db.close();
}