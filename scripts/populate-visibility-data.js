const Database = require('better-sqlite3');
const path = require('path');

// Open the database
const dbPath = path.join(__dirname, '..', 'data', 'store.db');
const db = new Database(dbPath);

try {
  // First, let's see how many rows need updating
  const checkRows = db.prepare(`
    SELECT COUNT(*) as count 
    FROM prompt_executions 
    WHERE business_visibility IS NULL 
      AND status = 'completed'
  `).get();
  
  console.log(`Found ${checkRows.count} rows with missing visibility data`);
  
  if (checkRows.count === 0) {
    console.log('No rows need updating');
    process.exit(0);
  }
  
  // Get all rows that need updating
  const rowsToUpdate = db.prepare(`
    SELECT id, business_id, prompt_id, platform_id, completed_at
    FROM prompt_executions 
    WHERE business_visibility IS NULL 
      AND status = 'completed'
  `).all();
  
  // Get competitors for each business (for competitor visibility)
  const getCompetitors = db.prepare(`
    SELECT id, name FROM competitors WHERE business_id = ?
  `);
  
  // Update each row with random visibility
  const updateStmt = db.prepare(`
    UPDATE prompt_executions 
    SET business_visibility = ?,
        competitor_visibilities = ?
    WHERE id = ?
  `);
  
  let updatedCount = 0;
  
  // Start a transaction for better performance
  const updateAll = db.transaction(() => {
    for (const row of rowsToUpdate) {
      // Generate random business visibility (0 or 1)
      // Let's make it 70% chance of being mentioned (1) for more interesting data
      const businessVisibility = Math.random() < 0.7 ? 1 : 0;
      
      // Get competitors for this business
      const competitors = getCompetitors.all(row.business_id);
      
      // Generate random visibility for each competitor
      const competitorVisibilities = {};
      for (const competitor of competitors) {
        // 40% chance each competitor is mentioned
        competitorVisibilities[competitor.name] = Math.random() < 0.4 ? 1 : 0;
      }
      
      // Update the row
      updateStmt.run(
        businessVisibility,
        JSON.stringify(competitorVisibilities),
        row.id
      );
      
      updatedCount++;
      
      // Log progress every 100 rows
      if (updatedCount % 100 === 0) {
        console.log(`Updated ${updatedCount} rows...`);
      }
    }
  });
  
  // Execute the transaction
  updateAll();
  
  console.log(`\n✓ Successfully updated ${updatedCount} rows with random visibility data`);
  
  // Show some statistics
  const stats = db.prepare(`
    SELECT 
      COUNT(*) as total,
      SUM(CASE WHEN business_visibility = 1 THEN 1 ELSE 0 END) as visible,
      SUM(CASE WHEN business_visibility = 0 THEN 1 ELSE 0 END) as not_visible,
      ROUND(AVG(business_visibility) * 100, 1) as avg_visibility_percent
    FROM prompt_executions
    WHERE status = 'completed'
  `).get();
  
  console.log('\nVisibility Statistics:');
  console.log(`  Total completed executions: ${stats.total}`);
  console.log(`  Business mentioned: ${stats.visible} (${((stats.visible/stats.total)*100).toFixed(1)}%)`);
  console.log(`  Business not mentioned: ${stats.not_visible} (${((stats.not_visible/stats.total)*100).toFixed(1)}%)`);
  console.log(`  Average visibility: ${stats.avg_visibility_percent}%`);
  
  // Also update execution_date for rows that don't have it
  console.log('\nChecking for missing execution_date values...');
  
  const missingDates = db.prepare(`
    SELECT COUNT(*) as count 
    FROM prompt_executions 
    WHERE execution_date IS NULL 
      AND completed_at IS NOT NULL
  `).get();
  
  if (missingDates.count > 0) {
    console.log(`Found ${missingDates.count} rows with missing execution_date`);
    
    const updateDates = db.prepare(`
      UPDATE prompt_executions 
      SET execution_date = DATE(completed_at)
      WHERE execution_date IS NULL 
        AND completed_at IS NOT NULL
    `);
    
    const result = updateDates.run();
    console.log(`✓ Updated ${result.changes} rows with execution_date`);
  } else {
    console.log('All rows have execution_date set');
  }
  
  // Show daily visibility trend
  console.log('\nDaily Visibility Trend (last 7 days):');
  const dailyTrend = db.prepare(`
    SELECT 
      execution_date,
      COUNT(*) as total_executions,
      ROUND(AVG(business_visibility) * 100, 1) as avg_visibility
    FROM prompt_executions
    WHERE execution_date IS NOT NULL
      AND status = 'completed'
    GROUP BY execution_date
    ORDER BY execution_date DESC
    LIMIT 7
  `).all();
  
  dailyTrend.reverse().forEach(day => {
    console.log(`  ${day.execution_date}: ${day.avg_visibility}% visibility (${day.total_executions} executions)`);
  });
  
} catch (error) {
  console.error('Error updating visibility data:', error);
} finally {
  db.close();
}