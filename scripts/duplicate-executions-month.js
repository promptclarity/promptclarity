const Database = require('better-sqlite3');
const path = require('path');

// Open the database
const dbPath = path.join(__dirname, '..', 'data', 'store.db');
const db = new Database(dbPath);

// Get all existing prompt executions (only the original ones, not duplicates)
const getExecutions = db.prepare(`
  SELECT * FROM prompt_executions 
  WHERE status = 'completed'
  ORDER BY created_at DESC
  LIMIT 40
`);

const insertExecution = db.prepare(`
  INSERT INTO prompt_executions (
    business_id, 
    prompt_id, 
    platform_id, 
    status, 
    result, 
    error_message,
    started_at, 
    completed_at, 
    created_at
  ) VALUES (
    @business_id,
    @prompt_id,
    @platform_id,
    @status,
    @result,
    @error_message,
    @started_at,
    @completed_at,
    @created_at
  )
`);

try {
  const executions = getExecutions.all();
  console.log(`Found ${executions.length} original executions to duplicate`);
  
  let duplicated = 0;
  
  // Create duplicates for each day going back 30 days
  for (let daysAgo = 2; daysAgo <= 30; daysAgo++) {
    for (const execution of executions) {
      // Create dates N days before the existing dates
      const originalCompleted = new Date(execution.completed_at);
      const originalCreated = new Date(execution.created_at);
      const originalStarted = execution.started_at ? new Date(execution.started_at) : null;
      
      const hoursToSubtract = daysAgo * 24 * 60 * 60 * 1000;
      const newCompleted = new Date(originalCompleted.getTime() - hoursToSubtract);
      const newCreated = new Date(originalCreated.getTime() - hoursToSubtract);
      const newStarted = originalStarted ? new Date(originalStarted.getTime() - hoursToSubtract) : null;
      
      // Add some variation to make it more realistic (±2 hours)
      const variation = (Math.random() - 0.5) * 4 * 60 * 60 * 1000; // ±2 hours in milliseconds
      newCompleted.setTime(newCompleted.getTime() + variation);
      if (newStarted) {
        newStarted.setTime(newStarted.getTime() + variation);
      }
      newCreated.setTime(newCreated.getTime() + variation);
      
      // Insert the duplicate with earlier timestamps
      insertExecution.run({
        business_id: execution.business_id,
        prompt_id: execution.prompt_id,
        platform_id: execution.platform_id,
        status: execution.status,
        result: execution.result,
        error_message: execution.error_message,
        started_at: newStarted ? newStarted.toISOString() : null,
        completed_at: newCompleted.toISOString(),
        created_at: newCreated.toISOString()
      });
      
      duplicated++;
    }
    
    console.log(`Day ${daysAgo}: Created ${executions.length} executions`);
  }
  
  console.log(`\nSuccessfully created ${duplicated} total executions for a month of historical data`);
  
  // Show distribution
  const countByDay = db.prepare(`
    SELECT 
      DATE(completed_at) as day,
      COUNT(*) as count
    FROM prompt_executions
    WHERE status = 'completed'
    GROUP BY DATE(completed_at)
    ORDER BY day DESC
    LIMIT 31
  `).all();
  
  console.log('\nExecutions per day:');
  countByDay.forEach(row => {
    console.log(`  ${row.day}: ${row.count} executions`);
  });
  
} catch (error) {
  console.error('Error duplicating executions:', error);
} finally {
  db.close();
}