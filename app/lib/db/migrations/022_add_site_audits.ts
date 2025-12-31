import { Migration } from './migration-runner';
import Database from 'better-sqlite3';

export const migration_022: Migration = {
  id: 22,
  name: 'add_site_audits',

  up(db: Database.Database): void {
    // Create site_audits table for tracking overall site audits
    db.exec(`
      CREATE TABLE IF NOT EXISTS site_audits (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        business_id TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        started_at DATETIME,
        completed_at DATETIME,
        total_pages INTEGER DEFAULT 0,
        pages_analyzed INTEGER DEFAULT 0,
        overall_score INTEGER,
        summary TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (business_id) REFERENCES businesses(id)
      );

      CREATE INDEX IF NOT EXISTS idx_site_audits_business ON site_audits(business_id);
      CREATE INDEX IF NOT EXISTS idx_site_audits_status ON site_audits(status);
    `);

    // Create page_audits table for individual page analysis
    db.exec(`
      CREATE TABLE IF NOT EXISTS page_audits (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        site_audit_id INTEGER NOT NULL,
        business_id TEXT NOT NULL,
        url TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',

        -- Structure analysis
        title TEXT,
        meta_description TEXT,
        h1_count INTEGER DEFAULT 0,
        h2_count INTEGER DEFAULT 0,
        h3_count INTEGER DEFAULT 0,
        has_proper_heading_hierarchy BOOLEAN DEFAULT 0,

        -- Schema markup
        schema_types TEXT,
        has_faq_schema BOOLEAN DEFAULT 0,
        has_howto_schema BOOLEAN DEFAULT 0,
        has_product_schema BOOLEAN DEFAULT 0,
        has_article_schema BOOLEAN DEFAULT 0,
        has_organization_schema BOOLEAN DEFAULT 0,

        -- Content analysis
        word_count INTEGER DEFAULT 0,
        has_qa_format BOOLEAN DEFAULT 0,
        has_lists BOOLEAN DEFAULT 0,
        has_tables BOOLEAN DEFAULT 0,
        internal_links_count INTEGER DEFAULT 0,
        external_links_count INTEGER DEFAULT 0,
        images_count INTEGER DEFAULT 0,
        images_with_alt INTEGER DEFAULT 0,

        -- Technical
        load_time_ms INTEGER,
        is_mobile_friendly BOOLEAN,
        has_canonical TEXT,
        robots_meta TEXT,

        -- Scoring
        structure_score INTEGER DEFAULT 0,
        content_score INTEGER DEFAULT 0,
        technical_score INTEGER DEFAULT 0,
        overall_score INTEGER DEFAULT 0,

        -- Recommendations
        issues TEXT,
        recommendations TEXT,

        analyzed_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (site_audit_id) REFERENCES site_audits(id),
        FOREIGN KEY (business_id) REFERENCES businesses(id)
      );

      CREATE INDEX IF NOT EXISTS idx_page_audits_site_audit ON page_audits(site_audit_id);
      CREATE INDEX IF NOT EXISTS idx_page_audits_business ON page_audits(business_id);
      CREATE INDEX IF NOT EXISTS idx_page_audits_url ON page_audits(url);
      CREATE INDEX IF NOT EXISTS idx_page_audits_score ON page_audits(overall_score);
    `);
  },

  down(db: Database.Database): void {
    db.exec(`
      DROP TABLE IF EXISTS page_audits;
      DROP TABLE IF EXISTS site_audits;
    `);
  },
};
