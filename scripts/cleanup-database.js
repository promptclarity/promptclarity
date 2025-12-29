const Database = require('better-sqlite3');
const path = require('path');

// Open the database
const dbPath = path.join(__dirname, '..', 'data', 'store.db');
const db = new Database(dbPath);

try {
  console.log('Starting database cleanup...\n');
  
  // Get current statistics before cleanup
  const beforeStats = db.prepare(`
    SELECT 
      (SELECT COUNT(*) FROM prompt_executions) as executions,
      (SELECT COUNT(*) FROM prompts WHERE is_custom = 1) as custom_prompts,
      (SELECT COUNT(*) FROM topics WHERE is_custom = 1) as custom_topics
  `).get();
  
  console.log('Before cleanup:');
  console.log(`  Prompt executions: ${beforeStats.executions}`);
  console.log(`  Custom prompts: ${beforeStats.custom_prompts}`);
  console.log(`  Custom topics: ${beforeStats.custom_topics}`);
  console.log();
  
  // Start transaction for atomic cleanup
  const cleanup = db.transaction(() => {
    // 1. Delete all prompt executions (this removes all test data)
    const execResult = db.prepare('DELETE FROM prompt_executions').run();
    console.log(`✓ Deleted ${execResult.changes} prompt executions`);
    
    // 2. Delete custom prompts (keep default prompts)
    const customPromptsResult = db.prepare('DELETE FROM prompts WHERE is_custom = 1').run();
    console.log(`✓ Deleted ${customPromptsResult.changes} custom prompts`);
    
    // 3. Delete custom topics (keep default topics)
    const customTopicsResult = db.prepare('DELETE FROM topics WHERE is_custom = 1').run();
    console.log(`✓ Deleted ${customTopicsResult.changes} custom topics`);
    
    // 4. Reset any test businesses (optional - uncomment if needed)
    // const testBusinessResult = db.prepare("DELETE FROM businesses WHERE name LIKE '%test%' OR name LIKE '%Test%'").run();
    // console.log(`✓ Deleted ${testBusinessResult.changes} test businesses`);
    
    // 5. Reset any test competitors (optional - uncomment if needed)
    // const testCompetitorsResult = db.prepare("DELETE FROM competitors WHERE name LIKE '%test%' OR name LIKE '%Test%'").run();
    // console.log(`✓ Deleted ${testCompetitorsResult.changes} test competitors`);
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
      (SELECT COUNT(*) FROM prompts) as total_prompts,
      (SELECT COUNT(*) FROM prompts WHERE is_custom = 0) as default_prompts,
      (SELECT COUNT(*) FROM topics) as total_topics,
      (SELECT COUNT(*) FROM topics WHERE is_custom = 0) as default_topics,
      (SELECT COUNT(*) FROM businesses) as businesses,
      (SELECT COUNT(*) FROM competitors) as competitors,
      (SELECT COUNT(*) FROM business_platforms) as models
  `).get();
  
  console.log('\nAfter cleanup:');
  console.log(`  Prompt executions: ${afterStats.executions}`);
  console.log(`  Total prompts: ${afterStats.total_prompts} (${afterStats.default_prompts} default)`);
  console.log(`  Total topics: ${afterStats.total_topics} (${afterStats.default_topics} default)`);
  console.log(`  Businesses: ${afterStats.businesses}`);
  console.log(`  Competitors: ${afterStats.competitors}`);
  console.log(`  AI Models: ${afterStats.models}`);
  
  // Show database file size
  const fs = require('fs');
  const stats = fs.statSync(dbPath);
  const fileSizeInMB = (stats.size / (1024 * 1024)).toFixed(2);
  console.log(`\nDatabase file size: ${fileSizeInMB} MB`);
  
  console.log('\n✓ Database cleanup completed successfully!');
  
} catch (error) {
  console.error('Error during database cleanup:', error);
  process.exit(1);
} finally {
  db.close();
}