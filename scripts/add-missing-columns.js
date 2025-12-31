#!/usr/bin/env node

const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(process.cwd(), 'data', 'store.db'));

console.log('Adding missing columns to prompt_executions table...');

try {
  db.pragma('foreign_keys = OFF');
  
  // Add missing columns to prompt_executions table
  const columns = [
    'refresh_date DATETIME',
    'brand_mentions INTEGER DEFAULT 0',
    'competitors_mentioned TEXT',
    'mention_analysis TEXT',
    'analysis_confidence REAL',
    'business_visibility REAL',
    'share_of_voice REAL',
    'competitor_share_of_voice TEXT',
    'competitor_visibilities TEXT'
  ];
  
  for (const column of columns) {
    try {
      const [colName] = column.split(' ');
      // Check if column exists
      const columnExists = db.prepare(`
        SELECT COUNT(*) as count 
        FROM pragma_table_info('prompt_executions') 
        WHERE name = ?
      `).get(colName);
      
      if (!columnExists || columnExists.count === 0) {
        console.log(`Adding column: ${colName}`);
        db.exec(`ALTER TABLE prompt_executions ADD COLUMN ${column}`);
      } else {
        console.log(`Column ${colName} already exists, skipping...`);
      }
    } catch (err) {
      if (!err.message.includes('duplicate column name')) {
        throw err;
      }
      console.log(`Column already exists: ${column.split(' ')[0]}`);
    }
  }
  
  db.pragma('foreign_keys = ON');
  
  console.log('Successfully added missing columns!');
  
  // Show current schema
  const schema = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='prompt_executions'").get();
  console.log('\nCurrent prompt_executions schema:');
  console.log(schema.sql);
  
} catch (error) {
  console.error('Error adding columns:', error);
  process.exit(1);
} finally {
  db.close();
}

console.log('\nMigration completed!');