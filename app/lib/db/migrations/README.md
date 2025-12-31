# Database Migrations

This directory contains all database schema migrations for the application.

## Overview

Database migrations allow us to:
- Track schema changes over time
- Version control database structure
- Apply changes consistently across environments
- Rollback changes if needed

## Migration Files

Migrations are numbered sequentially and stored in this directory:

```
001_initial_schema.ts
002_add_feature_x.ts
003_update_table_y.ts
...
```

## Creating a New Migration

### Step 1: Copy the Template

```bash
cp app/lib/db/migrations/TEMPLATE.ts app/lib/db/migrations/00X_your_description.ts
```

Replace `00X` with the next sequential number (e.g., 002, 003, etc.)

### Step 2: Update the Migration File

Edit your new migration file:

```typescript
import { Migration } from './migration-runner';

export const migration_002: Migration = {
  id: 2, // Sequential number
  name: 'add_user_roles', // Brief description

  up: (db) => {
    // Apply changes
    db.exec(`
      ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'user';
      CREATE INDEX idx_users_role ON users(role);
    `);
  },

  down: (db) => {
    // Rollback changes
    db.exec(`
      DROP INDEX IF EXISTS idx_users_role;
      -- Note: SQLite doesn't support DROP COLUMN easily
      -- May need to recreate table for complex rollbacks
    `);
  }
};
```

### Step 3: Add to Index

Update `migrations/index.ts`:

```typescript
import { migration_002 } from './002_add_user_roles';

export const allMigrations: Migration[] = [
  migration_001,
  migration_002, // Add your migration here
];
```

### Step 4: Test

The migration will run automatically when the database is initialized. To test:

1. Backup your database: `cp data/store.db data/store.db.backup`
2. Restart your application
3. Check the logs for migration success
4. Verify the changes in your database

## Migration Best Practices

### 1. Always Include Both Up and Down

Every migration should have both `up()` and `down()` methods, even if rollback is complex.

### 2. Use Transactions for Complex Migrations

```typescript
up: (db) => {
  db.exec('BEGIN TRANSACTION;');
  try {
    db.exec(`
      -- Your changes here
    `);
    db.exec('COMMIT;');
  } catch (error) {
    db.exec('ROLLBACK;');
    throw error;
  }
}
```

### 3. Handle Existing Data

When adding new columns, provide default values:

```sql
ALTER TABLE users ADD COLUMN email TEXT DEFAULT '';
```

### 4. Create Indexes for Foreign Keys

Always create indexes on foreign key columns for better performance:

```sql
CREATE INDEX idx_orders_user_id ON orders(user_id);
```

### 5. Document Complex Changes

Add comments to explain non-obvious changes:

```typescript
up: (db) => {
  db.exec(`
    -- Migrating from single 'name' column to 'first_name' and 'last_name'
    ALTER TABLE users ADD COLUMN first_name TEXT;
    ALTER TABLE users ADD COLUMN last_name TEXT;

    -- Copy existing names to first_name
    UPDATE users SET first_name = name WHERE name IS NOT NULL;
  `);
}
```

## SQLite Limitations

SQLite has some limitations compared to other databases:

- **Cannot DROP COLUMN**: You'll need to recreate the table
- **Cannot modify column types**: Must recreate the table
- **Limited ALTER TABLE**: Only supports RENAME and ADD COLUMN

For complex table modifications, use this pattern:

```sql
-- Create new table with desired schema
CREATE TABLE users_new (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL
);

-- Copy data
INSERT INTO users_new SELECT id, name, email FROM users;

-- Drop old table
DROP TABLE users;

-- Rename new table
ALTER TABLE users_new RENAME TO users;

-- Recreate indexes
CREATE INDEX idx_users_email ON users(email);
```

## Viewing Applied Migrations

Applied migrations are tracked in the `schema_migrations` table:

```sql
SELECT * FROM schema_migrations ORDER BY id;
```

## Manual Migration Commands

If you need to manually run migrations:

```typescript
import { MigrationRunner, allMigrations } from './migrations';
import Database from 'better-sqlite3';

const db = new Database('data/store.db');
const runner = new MigrationRunner(db);

// Run all pending migrations
runner.runMigrations(allMigrations);

// Rollback a specific migration
runner.rollback(migration_002);

// View applied migrations
const applied = runner.getAppliedMigrations();
console.log(applied);
```

## Example Migrations

### Adding a Column

```typescript
export const migration_002: Migration = {
  id: 2,
  name: 'add_user_avatar',

  up: (db) => {
    db.exec(`
      ALTER TABLE users ADD COLUMN avatar_url TEXT;
    `);
  },

  down: (db) => {
    // SQLite doesn't support DROP COLUMN easily
    // Would need to recreate table without the column
    throw new Error('Rollback not implemented - requires table recreation');
  }
};
```

### Creating a New Table

```typescript
export const migration_003: Migration = {
  id: 3,
  name: 'create_notifications_table',

  up: (db) => {
    db.exec(`
      CREATE TABLE notifications (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        message TEXT NOT NULL,
        read BOOLEAN DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );

      CREATE INDEX idx_notifications_user ON notifications(user_id);
      CREATE INDEX idx_notifications_read ON notifications(read);
    `);
  },

  down: (db) => {
    db.exec(`DROP TABLE IF EXISTS notifications;`);
  }
};
```

### Adding an Index

```typescript
export const migration_004: Migration = {
  id: 4,
  name: 'add_email_index',

  up: (db) => {
    db.exec(`
      CREATE INDEX idx_users_email ON users(email);
    `);
  },

  down: (db) => {
    db.exec(`DROP INDEX IF EXISTS idx_users_email;`);
  }
};
```

## Troubleshooting

### Migration Failed

1. Check the error message in console
2. Restore from backup: `cp data/store.db.backup data/store.db`
3. Fix the migration
4. Try again

### Migration Applied But Wrong

1. Create a new migration to fix the issue (don't modify the old one)
2. Or rollback and fix:
   ```typescript
   runner.rollback(problematic_migration);
   // Fix the migration
   runner.runMigrations([fixed_migration]);
   ```

### Need to Reset All Migrations

**WARNING**: This will delete all data!

```bash
rm data/store.db
# App will recreate database and run all migrations
```

## Version Control

- Always commit migration files with your code changes
- Never modify existing migrations that have been deployed
- Create new migrations to fix issues instead
