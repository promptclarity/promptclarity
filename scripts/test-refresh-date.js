const Database = require('better-sqlite3');
const path = require('path');

// Open the database
const dbPath = path.join(__dirname, '..', 'data', 'store.db');
const db = new Database(dbPath);

try {
  // Create a test date
  const now = new Date();
  console.log('Current time:', now.toISOString());
  
  // Round to the hour as the code should do
  now.setUTCMinutes(0, 0, 0);
  const expectedRefreshDate = now.toISOString();
  console.log('Expected refresh_date (rounded to hour):', expectedRefreshDate);
  
  // Check the most recent prompt execution
  const latestExecution = db.prepare(`
    SELECT id, refresh_date, created_at
    FROM prompt_executions
    ORDER BY id DESC
    LIMIT 1
  `).get();
  
  if (latestExecution) {
    console.log('\nLatest execution:');
    console.log('  ID:', latestExecution.id);
    console.log('  refresh_date:', latestExecution.refresh_date);
    console.log('  created_at:', latestExecution.created_at);
    
    // Parse the refresh_date to check format
    const refreshDate = new Date(latestExecution.refresh_date);
    console.log('\nRefresh date analysis:');
    console.log('  Hours:', refreshDate.getUTCHours());
    console.log('  Minutes:', refreshDate.getUTCMinutes());
    console.log('  Seconds:', refreshDate.getUTCSeconds());
    console.log('  Milliseconds:', refreshDate.getUTCMilliseconds());
    
    if (refreshDate.getUTCMinutes() === 0 && 
        refreshDate.getUTCSeconds() === 0 && 
        refreshDate.getUTCMilliseconds() === 0) {
      console.log('\n✅ refresh_date is correctly rounded to the hour!');
    } else {
      console.log('\n⚠️ refresh_date is NOT rounded to the hour');
    }
  } else {
    console.log('\nNo executions found in the database');
  }
  
  // Show a few more recent executions for context
  console.log('\n--- Recent executions ---');
  const recentExecutions = db.prepare(`
    SELECT id, refresh_date, created_at
    FROM prompt_executions
    ORDER BY id DESC
    LIMIT 5
  `).all();
  
  recentExecutions.forEach(exec => {
    const date = new Date(exec.refresh_date);
    const isRounded = date.getUTCMinutes() === 0 && 
                      date.getUTCSeconds() === 0 && 
                      date.getUTCMilliseconds() === 0;
    console.log(`ID ${exec.id}: ${exec.refresh_date} ${isRounded ? '✅' : '❌'}`);
  });
  
} catch (error) {
  console.error('Error:', error);
} finally {
  db.close();
}