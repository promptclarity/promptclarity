const Database = require('better-sqlite3');
const path = require('path');

// Open the database
const dbPath = path.join(__dirname, '..', 'data', 'store.db');
const db = new Database(dbPath);

try {
  console.log('Fixing refresh_date format to proper ISO 8601 UTC timestamps...\n');
  
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
      let isoDate;
      
      // Check if it's already in ISO format or just YYYY-MM-DD
      if (exec.refresh_date.includes('T')) {
        // Already in ISO format, ensure it's at beginning of day
        const date = new Date(exec.refresh_date);
        date.setUTCHours(0, 0, 0, 0);
        isoDate = date.toISOString();
      } else {
        // It's YYYY-MM-DD, convert to ISO 8601 at beginning of day UTC
        const date = new Date(exec.refresh_date + 'T00:00:00.000Z');
        isoDate = date.toISOString();
      }
      
      // Update if the value changed
      if (isoDate !== exec.refresh_date) {
        updateStmt.run(isoDate, exec.id);
        updated++;
      }
    });
    
    return updated;
  });
  
  const updatedCount = updateAll();
  
  console.log(`\n✓ Updated ${updatedCount} refresh_date values to ISO 8601 UTC format`);
  
  // Show sample of updated data
  const samples = db.prepare(`
    SELECT id, refresh_date 
    FROM prompt_executions 
    WHERE refresh_date IS NOT NULL
    ORDER BY refresh_date DESC
    LIMIT 10
  `).all();
  
  console.log('\nSample updated dates (newest first):');
  samples.forEach(s => {
    console.log(`  ID ${s.id}: ${s.refresh_date}`);
  });
  
  // Verify date range queries work correctly
  const today = new Date();
  today.setUTCHours(23, 59, 59, 999);
  const endDate = today.toISOString();
  
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - 13); // 14 days including today
  startDate.setUTCHours(0, 0, 0, 0);
  const startDateStr = startDate.toISOString();
  
  const testCount = db.prepare(`
    SELECT COUNT(*) as count 
    FROM prompt_executions 
    WHERE refresh_date >= ? AND refresh_date <= ?
  `).get(startDateStr, endDate);
  
  console.log('\nTest query for 14-day range:');
  console.log(`  Start: ${startDateStr}`);
  console.log(`  End: ${endDate}`);
  console.log(`  Results: ${testCount.count} executions`);
  
  // Show distinct dates in the range
  const datesInRange = db.prepare(`
    SELECT DISTINCT DATE(refresh_date) as date, COUNT(*) as count
    FROM prompt_executions 
    WHERE refresh_date >= ? AND refresh_date <= ?
    GROUP BY DATE(refresh_date)
    ORDER BY date DESC
  `).all(startDateStr, endDate);
  
  console.log('\nDates with data in 14-day range:');
  datesInRange.forEach(d => {
    console.log(`  ${d.date}: ${d.count} executions`);
  });
  
} catch (error) {
  console.error('Error fixing refresh dates:', error);
  process.exit(1);
} finally {
  db.close();
}