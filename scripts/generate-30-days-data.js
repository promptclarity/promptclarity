const Database = require('better-sqlite3');
const path = require('path');

// Open the database
const dbPath = path.join(__dirname, '..', 'data', 'store.db');
const db = new Database(dbPath);

try {
  console.log('Generating 30 days of prompt execution data...\n');
  
  // Get business info
  const business = db.prepare('SELECT * FROM businesses LIMIT 1').get();
  if (!business) {
    console.log('No business found. Please complete onboarding first.');
    process.exit(1);
  }
  
  // Get all prompts for the business
  const prompts = db.prepare('SELECT * FROM prompts WHERE business_id = ?').all(business.id);
  console.log(`Found ${prompts.length} prompts for business: ${business.business_name}`);
  
  // Get all AI platforms except Perplexity
  const platforms = db.prepare(`
    SELECT * FROM platforms 
    WHERE business_id = ? 
      AND is_active = 1 
      AND provider != 'perplexity'
  `).all(business.id);
  console.log(`Found ${platforms.length} AI platforms (excluding Perplexity)`);
  
  // Get competitors for SOV calculation
  const competitors = db.prepare('SELECT * FROM competitors WHERE business_id = ?').all(business.id);
  console.log(`Found ${competitors.length} competitors`);
  
  if (prompts.length === 0 || platforms.length === 0) {
    console.log('No prompts or platforms found. Cannot generate data.');
    process.exit(1);
  }
  
  // Prepare insert statement
  const insertExecution = db.prepare(`
    INSERT INTO prompt_executions (
      business_id,
      prompt_id,
      platform_id,
      status,
      result,
      started_at,
      completed_at,
      refresh_date,
      brand_mentions,
      competitors_mentioned,
      mention_analysis,
      analysis_confidence,
      business_visibility,
      competitor_visibilities,
      share_of_voice,
      competitor_share_of_voice,
      created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  
  // Generate data for the last 30 days
  const today = new Date();
  const daysToGenerate = 30;
  let totalGenerated = 0;
  
  // Start a transaction for better performance
  const generateAll = db.transaction(() => {
    for (let daysAgo = 0; daysAgo < daysToGenerate; daysAgo++) {
      const currentDate = new Date(today);
      currentDate.setDate(today.getDate() - daysAgo);
      // Set to 22:00:00.000 UTC for consistency
      currentDate.setUTCHours(22, 0, 0, 0);
      const refreshDate = currentDate.toISOString(); // Full ISO 8601 timestamp
      const dateTimeStr = currentDate.toISOString();
      
      // For each day, generate executions for ALL prompts to ensure complete data
      const promptsToExecute = prompts; // Execute all prompts for complete coverage
      
      for (const prompt of promptsToExecute) {
        // Execute with each model (or a subset)
        const platformsToUse = platforms.filter(() => Math.random() > 0.2); // 80% chance for each model
        
        for (const platform of platformsToUse) {
          // Generate random visibility and SOV data
          const businessMentioned = Math.random() > 0.3 ? 1 : 0; // 70% chance of being mentioned
          
          // Randomly select which competitors are mentioned
          const mentionedCompetitors = competitors.filter(() => Math.random() > 0.6); // 40% chance each
          const competitorNames = mentionedCompetitors.map(c => c.name);
          
          // Calculate visibility for each competitor
          const competitorVisibilities = {};
          competitors.forEach(comp => {
            competitorVisibilities[comp.name] = mentionedCompetitors.includes(comp) ? 1 : 0;
          });
          
          // Calculate share of voice
          const totalMentions = businessMentioned + mentionedCompetitors.length;
          const businessSOV = totalMentions > 0 ? Math.round((businessMentioned / totalMentions) * 1000) / 10 : 0;
          
          // Calculate competitor SOV
          const competitorSOV = {};
          competitors.forEach(comp => {
            if (totalMentions > 0 && mentionedCompetitors.includes(comp)) {
              competitorSOV[comp.name] = Math.round((1 / totalMentions) * 1000) / 10;
            } else {
              competitorSOV[comp.name] = 0;
            }
          });
          
          // Generate a sample result
          const sampleResults = [
            `Based on the criteria, here are the top recommendations:\n\n1. ${business.business_name} - Excellent solution with comprehensive features\n2. ${mentionedCompetitors[0]?.name || 'Alternative Option'} - Good alternative\n3. ${mentionedCompetitors[1]?.name || 'Another Option'} - Worth considering`,
            `The best options in this category include ${businessMentioned ? business.business_name + ', ' : ''}${competitorNames.join(', ')}. Each offers unique advantages depending on your specific needs.`,
            `After careful analysis, ${businessMentioned ? business.business_name + ' stands out' : 'several options stand out'} in this space. ${competitorNames.length > 0 ? 'Competitors like ' + competitorNames.join(' and ') + ' also offer compelling features.' : ''}`,
            `For this use case, ${businessMentioned ? 'I recommend ' + business.business_name : 'I recommend exploring options like ' + competitorNames.join(', ')}. These solutions provide the functionality you're looking for.`,
            `The market leaders include ${businessMentioned ? business.business_name : competitorNames[0] || 'several options'}. ${competitorNames.length > 1 ? 'Also consider ' + competitorNames.slice(1).join(', ') + '.' : ''}`
          ];
          
          const result = sampleResults[Math.floor(Math.random() * sampleResults.length)];
          
          // Generate analysis details
          const analysisDetails = {
            rankings: [],
            brandMentioned: businessMentioned === 1,
            brandPosition: businessMentioned ? Math.floor(Math.random() * 5) + 1 : null,
            overallSentiment: ['positive', 'neutral', 'negative'][Math.floor(Math.random() * 3)],
            confidence: Math.random() * 0.5 + 0.5 // 0.5 to 1.0
          };
          
          // Add rankings
          let position = 1;
          if (businessMentioned) {
            analysisDetails.rankings.push({
              position: position++,
              company: business.business_name,
              sentiment: 'positive'
            });
          }
          mentionedCompetitors.forEach(comp => {
            analysisDetails.rankings.push({
              position: position++,
              company: comp.name,
              sentiment: ['positive', 'neutral'][Math.floor(Math.random() * 2)]
            });
          });
          
          // Set completed time with some variation throughout the day
          const completedTime = new Date(currentDate);
          completedTime.setHours(Math.floor(Math.random() * 24));
          completedTime.setMinutes(Math.floor(Math.random() * 60));
          const completedAt = completedTime.toISOString();
          
          // Started time is a few seconds before completed
          const startedTime = new Date(completedTime.getTime() - Math.random() * 5000);
          const startedAt = startedTime.toISOString();
          
          // Insert the execution
          insertExecution.run(
            business.id,
            prompt.id,
            platform.id,
            'completed',
            result,
            startedAt,
            completedAt,
            refreshDate,
            businessMentioned,
            JSON.stringify(competitorNames),
            JSON.stringify(analysisDetails),
            analysisDetails.confidence,
            businessMentioned,
            JSON.stringify(competitorVisibilities),
            businessSOV,
            JSON.stringify(competitorSOV),
            completedAt
          );
          
          totalGenerated++;
        }
      }
      
      console.log(`Generated data for ${refreshDate.split('T')[0]}: ${promptsToExecute.length} prompts × ${Math.ceil(platforms.length * 0.8)} platforms (avg)`);
    }
  });
  
  // Execute the transaction
  console.log('\nInserting all records...');
  generateAll();
  
  console.log(`\n✓ Successfully generated ${totalGenerated} prompt executions over ${daysToGenerate} days`);
  
  // Show statistics
  const stats = db.prepare(`
    SELECT 
      COUNT(*) as total,
      COUNT(DISTINCT refresh_date) as unique_days,
      COUNT(DISTINCT prompt_id) as unique_prompts,
      COUNT(DISTINCT platform_id) as unique_platforms,
      ROUND(AVG(business_visibility) * 100, 1) as avg_visibility,
      ROUND(AVG(share_of_voice), 1) as avg_sov
    FROM prompt_executions
    WHERE business_id = ? AND status = 'completed'
  `).get(business.id);
  
  console.log('\nDatabase Statistics:');
  console.log(`  Total executions: ${stats.total}`);
  console.log(`  Unique days: ${stats.unique_days}`);
  console.log(`  Unique prompts used: ${stats.unique_prompts}`);
  console.log(`  Unique AI platforms used: ${stats.unique_platforms}`);
  console.log(`  Average visibility: ${stats.avg_visibility}%`);
  console.log(`  Average share of voice: ${stats.avg_sov}%`);
  
  // Show daily breakdown for last 7 days
  console.log('\nLast 7 days breakdown:');
  const dailyStats = db.prepare(`
    SELECT 
      refresh_date,
      COUNT(*) as executions,
      ROUND(AVG(business_visibility) * 100, 1) as avg_visibility,
      ROUND(AVG(share_of_voice), 1) as avg_sov
    FROM prompt_executions
    WHERE business_id = ? AND status = 'completed'
    GROUP BY refresh_date
    ORDER BY refresh_date DESC
    LIMIT 7
  `).all(business.id);
  
  dailyStats.forEach(day => {
    console.log(`  ${day.refresh_date}: ${day.executions} executions, ${day.avg_visibility}% visibility, ${day.avg_sov}% SOV`);
  });
  
} catch (error) {
  console.error('Error generating data:', error);
  process.exit(1);
} finally {
  db.close();
}