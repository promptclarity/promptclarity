const Database = require('better-sqlite3');
const path = require('path');

// Open the database
const dbPath = path.join(__dirname, '..', 'data', 'store.db');
const db = new Database(dbPath);

// Get all existing prompt executions
const getExecutions = db.prepare(`
  SELECT * FROM prompt_executions 
  WHERE status = 'completed'
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
  console.log(`Found ${executions.length} executions to duplicate`);
  
  let duplicated = 0;
  
  for (const execution of executions) {
    // Create a date 24 hours before the existing dates
    const originalCompleted = new Date(execution.completed_at);
    const originalCreated = new Date(execution.created_at);
    const originalStarted = execution.started_at ? new Date(execution.started_at) : null;
    
    const newCompleted = new Date(originalCompleted.getTime() - 24 * 60 * 60 * 1000);
    const newCreated = new Date(originalCreated.getTime() - 24 * 60 * 60 * 1000);
    const newStarted = originalStarted ? new Date(originalStarted.getTime() - 24 * 60 * 60 * 1000) : null;
    
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
  
  console.log(`Successfully duplicated ${duplicated} executions with timestamps 24 hours earlier`);
  
} catch (error) {
  console.error('Error duplicating executions:', error);
} finally {
  db.close();
}