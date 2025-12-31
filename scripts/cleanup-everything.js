const Database = require('better-sqlite3');
const path = require('path');

// Open the database
const dbPath = path.join(__dirname, '..', 'data', 'store.db');
const db = new Database(dbPath);

try {
  console.log('⚠️  WARNING: This will delete ALL data from the database!');
  console.log('Starting complete database cleanup...\n');
  
  // Get current statistics before cleanup
  const beforeStats = db.prepare(`
    SELECT 
      (SELECT COUNT(*) FROM prompt_executions) as executions,
      (SELECT COUNT(*) FROM prompts) as prompts,
      (SELECT COUNT(*) FROM topics) as topics,
      (SELECT COUNT(*) FROM businesses) as businesses,
      (SELECT COUNT(*) FROM competitors) as competitors,
      (SELECT COUNT(*) FROM business_platforms) as models
  `).get();
  
  console.log('Before cleanup:');
  console.log(`  Prompt executions: ${beforeStats.executions}`);
  console.log(`  Prompts: ${beforeStats.prompts}`);
  console.log(`  Topics: ${beforeStats.topics}`);
  console.log(`  Businesses: ${beforeStats.businesses}`);
  console.log(`  Competitors: ${beforeStats.competitors}`);
  console.log(`  AI Models: ${beforeStats.models}`);
  console.log();
  
  // Start transaction for atomic cleanup
  const cleanup = db.transaction(() => {
    // Delete in order to respect foreign key constraints
    
    // 1. Delete all prompt executions
    const execResult = db.prepare('DELETE FROM prompt_executions').run();
    console.log(`✓ Deleted ${execResult.changes} prompt executions`);
    
    // 2. Delete all prompts
    const promptsResult = db.prepare('DELETE FROM prompts').run();
    console.log(`✓ Deleted ${promptsResult.changes} prompts`);
    
    // 3. Delete all topics
    const topicsResult = db.prepare('DELETE FROM topics').run();
    console.log(`✓ Deleted ${topicsResult.changes} topics`);
    
    // 4. Delete all competitors
    const competitorsResult = db.prepare('DELETE FROM competitors').run();
    console.log(`✓ Deleted ${competitorsResult.changes} competitors`);
    
    // 5. Delete all AI models
    const modelsResult = db.prepare('DELETE FROM business_platforms').run();
    console.log(`✓ Deleted ${modelsResult.changes} AI models`);
    
    // 6. Delete all businesses
    const businessesResult = db.prepare('DELETE FROM businesses').run();
    console.log(`✓ Deleted ${businessesResult.changes} businesses`);
    
    // Reset autoincrement counters (SQLite specific)
    db.exec("DELETE FROM sqlite_sequence");
    console.log('✓ Reset all auto-increment counters');
  });
  
  // Execute the cleanup
  cleanup();
  
  // Vacuum the database to reclaim space
  console.log('\nOptimizing database...');
  db.exec('VACUUM');
  console.log('✓ Database optimized');
  
  // Get statistics after cleanup
  const afterStats = db.prepare(`
    SELECT 
      (SELECT COUNT(*) FROM prompt_executions) as executions,
      (SELECT COUNT(*) FROM prompts) as prompts,
      (SELECT COUNT(*) FROM topics) as topics,
      (SELECT COUNT(*) FROM businesses) as businesses,
      (SELECT COUNT(*) FROM competitors) as competitors,
      (SELECT COUNT(*) FROM business_platforms) as models
  `).get();
  
  console.log('\nAfter cleanup:');
  console.log(`  Prompt executions: ${afterStats.executions}`);
  console.log(`  Prompts: ${afterStats.prompts}`);
  console.log(`  Topics: ${afterStats.topics}`);
  console.log(`  Businesses: ${afterStats.businesses}`);
  console.log(`  Competitors: ${afterStats.competitors}`);
  console.log(`  AI Models: ${afterStats.models}`);
  
  // Show database file size
  const fs = require('fs');
  const stats = fs.statSync(dbPath);
  const fileSizeInMB = (stats.size / (1024 * 1024)).toFixed(2);
  console.log(`\nDatabase file size: ${fileSizeInMB} MB`);
  
  console.log('\n✅ Complete database cleanup finished!');
  console.log('⚠️  The database is now completely empty. You will need to run the onboarding process again.');
  
} catch (error) {
  console.error('Error during database cleanup:', error);
  process.exit(1);
} finally {
  db.close();
}