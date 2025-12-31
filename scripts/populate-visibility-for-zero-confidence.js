const Database = require('better-sqlite3');
const path = require('path');

// Open the database
const dbPath = path.join(__dirname, '..', 'data', 'store.db');
const db = new Database(dbPath);

try {
  // First, let's see how many rows need updating (where analysis_confidence = 0)
  const checkRows = db.prepare(`
    SELECT COUNT(*) as count 
    FROM prompt_executions 
    WHERE analysis_confidence = 0
      AND status = 'completed'
  `).get();
  
  console.log(`Found ${checkRows.count} rows with analysis_confidence = 0`);
  
  if (checkRows.count === 0) {
    console.log('No rows need updating');
    process.exit(0);
  }
  
  // Get all rows that need updating
  const rowsToUpdate = db.prepare(`
    SELECT id, business_id, prompt_id, platform_id, completed_at
    FROM prompt_executions 
    WHERE analysis_confidence = 0
      AND status = 'completed'
  `).all();
  
  console.log(`Processing ${rowsToUpdate.length} rows...`);
  
  // Get competitors for each business (for competitor visibility)
  const getCompetitors = db.prepare(`
    SELECT id, name FROM competitors WHERE business_id = ?
  `);
  
  // Update each row with random visibility
  const updateStmt = db.prepare(`
    UPDATE prompt_executions 
    SET business_visibility = ?,
        competitor_visibilities = ?,
        execution_date = CASE 
          WHEN execution_date IS NULL THEN DATE(completed_at)
          ELSE execution_date 
        END
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
  
  // Show statistics for the updated rows
  const updatedStats = db.prepare(`
    SELECT 
      COUNT(*) as total,
      SUM(CASE WHEN business_visibility = 1 THEN 1 ELSE 0 END) as visible,
      SUM(CASE WHEN business_visibility = 0 THEN 1 ELSE 0 END) as not_visible,
      ROUND(AVG(business_visibility) * 100, 1) as avg_visibility_percent
    FROM prompt_executions
    WHERE id IN (${rowsToUpdate.map(r => r.id).join(',')})
  `).get();
  
  console.log('\nUpdated Rows Statistics:');
  console.log(`  Total updated: ${updatedStats.total}`);
  console.log(`  Business mentioned: ${updatedStats.visible} (${((updatedStats.visible/updatedStats.total)*100).toFixed(1)}%)`);
  console.log(`  Business not mentioned: ${updatedStats.not_visible} (${((updatedStats.not_visible/updatedStats.total)*100).toFixed(1)}%)`);
  console.log(`  Average visibility: ${updatedStats.avg_visibility_percent}%`);
  
  // Show overall statistics
  const overallStats = db.prepare(`
    SELECT 
      COUNT(*) as total,
      SUM(CASE WHEN business_visibility = 1 THEN 1 ELSE 0 END) as visible,
      SUM(CASE WHEN business_visibility = 0 THEN 1 ELSE 0 END) as not_visible,
      SUM(CASE WHEN business_visibility IS NULL THEN 1 ELSE 0 END) as null_visibility,
      ROUND(AVG(CASE WHEN business_visibility IS NOT NULL THEN business_visibility ELSE NULL END) * 100, 1) as avg_visibility_percent
    FROM prompt_executions
    WHERE status = 'completed'
  `).get();
  
  console.log('\nOverall Visibility Statistics:');
  console.log(`  Total completed executions: ${overallStats.total}`);
  console.log(`  Business mentioned: ${overallStats.visible} (${((overallStats.visible/overallStats.total)*100).toFixed(1)}%)`);
  console.log(`  Business not mentioned: ${overallStats.not_visible} (${((overallStats.not_visible/overallStats.total)*100).toFixed(1)}%)`);
  console.log(`  Missing visibility data: ${overallStats.null_visibility}`);
  console.log(`  Average visibility: ${overallStats.avg_visibility_percent}%`);
  
  // Show daily visibility trend
  console.log('\nDaily Visibility Trend (last 7 days with data):');
  const dailyTrend = db.prepare(`
    SELECT 
      execution_date,
      COUNT(*) as total_executions,
      ROUND(AVG(business_visibility) * 100, 1) as avg_visibility
    FROM prompt_executions
    WHERE execution_date IS NOT NULL
      AND status = 'completed'
      AND business_visibility IS NOT NULL
    GROUP BY execution_date
    ORDER BY execution_date DESC
    LIMIT 7
  `).all();
  
  if (dailyTrend.length > 0) {
    dailyTrend.reverse().forEach(day => {
      console.log(`  ${day.execution_date}: ${day.avg_visibility}% visibility (${day.total_executions} executions)`);
    });
  } else {
    console.log('  No daily trend data available');
  }
  
} catch (error) {
  console.error('Error updating visibility data:', error);
} finally {
  db.close();
}