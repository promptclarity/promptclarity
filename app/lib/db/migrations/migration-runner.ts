import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

export interface Migration {
  id: number;
  name: string;
  up: (db: Database.Database) => void;
  down: (db: Database.Database) => void;
}

/**
 * Migration Runner
 * Handles database schema migrations
 */
export class MigrationRunner {
  private db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
    this.initializeMigrationsTable();
  }

  /**
   * Create migrations tracking table if it doesn't exist
   */
  private initializeMigrationsTable() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);
  }

  /**
   * Check if a migration has been applied
   */
  private isMigrationApplied(migrationId: number): boolean {
    const result = this.db.prepare(
      'SELECT id FROM schema_migrations WHERE id = ?'
    ).get(migrationId);
    return result !== undefined;
  }

  /**
   * Record a migration as applied
   */
  private recordMigration(migration: Migration) {
    this.db.prepare(
      'INSERT INTO schema_migrations (id, name) VALUES (?, ?)'
    ).run(migration.id, migration.name);
  }

  /**
   * Remove a migration record
   */
  private removeMigrationRecord(migrationId: number) {
    this.db.prepare(
      'DELETE FROM schema_migrations WHERE id = ?'
    ).run(migrationId);
  }

  /**
   * Run pending migrations
   */
  runMigrations(migrations: Migration[]) {
    // Sort migrations by id to ensure correct order
    const sortedMigrations = [...migrations].sort((a, b) => a.id - b.id);

    for (const migration of sortedMigrations) {
      if (!this.isMigrationApplied(migration.id)) {
        console.log(`Running migration ${migration.id}: ${migration.name}`);

        try {
          migration.up(this.db);
          this.recordMigration(migration);
          console.log(`✓ Migration ${migration.id} completed successfully`);
        } catch (error) {
          console.error(`✗ Migration ${migration.id} failed:`, error);
          throw error;
        }
      }
    }
  }

  /**
   * Rollback a specific migration
   */
  rollback(migration: Migration) {
    if (this.isMigrationApplied(migration.id)) {
      console.log(`Rolling back migration ${migration.id}: ${migration.name}`);

      try {
        migration.down(this.db);
        this.removeMigrationRecord(migration.id);
        console.log(`✓ Migration ${migration.id} rolled back successfully`);
      } catch (error) {
        console.error(`✗ Rollback ${migration.id} failed:`, error);
        throw error;
      }
    } else {
      console.log(`Migration ${migration.id} was not applied, skipping rollback`);
    }
  }

  /**
   * Get list of applied migrations
   */
  getAppliedMigrations(): Array<{ id: number; name: string; applied_at: string }> {
    return this.db.prepare(
      'SELECT id, name, applied_at FROM schema_migrations ORDER BY id'
    ).all() as Array<{ id: number; name: string; applied_at: string }>;
  }
}
