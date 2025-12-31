# Project Guidelines for Claude

## Database Migrations

**IMPORTANT**: When making changes that affect the database schema, always create a migration script.

### When to create a migration:
- Adding a new column to an existing table
- Creating a new table
- Adding or removing indexes
- Modifying column constraints or defaults
- Renaming columns or tables

### When a migration is NOT needed:
- Filtering existing data in application code
- Adding new API endpoints that query existing schema
- UI changes
- Business logic changes that don't touch the schema

### How to create a migration:
1. Create a new file: `app/lib/db/migrations/0XX_description.ts` (use next sequential number)
2. Follow the template in `app/lib/db/migrations/TEMPLATE.txt`
3. Add the migration to `app/lib/db/migrations/index.ts`
4. Migrations run automatically on app startup

### Migration checklist:
- [ ] Both `up()` and `down()` methods implemented
- [ ] Default values provided for new columns on existing tables
- [ ] Indexes created for foreign key columns
- [ ] Migration added to `index.ts`
- [ ] Tested locally before pushing

See `app/lib/db/migrations/README.md` for full documentation.
