const Database = require('better-sqlite3');
const path = require('path');

// Open the database
const dbPath = path.join(__dirname, '..', 'data', 'store.db');
const db = new Database(dbPath);

try {
  // Check if the name column already exists
  const tableInfo = db.prepare("PRAGMA table_info(platforms)").all();
  const hasNameColumn = tableInfo.some(col => col.name === 'name');
  
  if (!hasNameColumn) {
    console.log('Adding name column to platforms table...');
    
    // Add the name column
    db.prepare(`
      ALTER TABLE platforms 
      ADD COLUMN name TEXT
    `).run();
    
    console.log('✓ Added name column to platforms table');
    
    // Update existing records with platform names based on provider
    const platformNameMap = {
      'openai': 'ChatGPT',
      'anthropic': 'Anthropic Claude',
      'google': 'Google Gemini',
      'perplexity': 'Perplexity',
      'xai': 'Grok'
    };
    
    // Update existing platforms with names
    const updateStmt = db.prepare('UPDATE platforms SET name = ? WHERE provider = ?');
    
    for (const [provider, name] of Object.entries(platformNameMap)) {
      const result = updateStmt.run(name, provider);
      if (result.changes > 0) {
        console.log(`✓ Updated ${result.changes} ${provider} platform(s) with name: ${name}`);
      }
    }
  } else {
    console.log('Name column already exists in platforms table');
  }
  
  // Show current platforms
  const platforms = db.prepare('SELECT * FROM platforms').all();
  console.log('\nCurrent platforms:');
  platforms.forEach(p => {
    console.log(`  - ${p.name || 'No name'} (${p.provider}): ${p.model_name}`);
  });
  
} catch (error) {
  console.error('Error adding name field to platforms table:', error);
} finally {
  db.close();
}