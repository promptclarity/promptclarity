-- Create tables for onboarding data
CREATE TABLE IF NOT EXISTS businesses (
                                          id INTEGER PRIMARY KEY AUTOINCREMENT,
                                          business_name TEXT NOT NULL,
                                          website TEXT NOT NULL,
                                          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                                          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS topics (
                                      id INTEGER PRIMARY KEY AUTOINCREMENT,
                                      business_id INTEGER NOT NULL,
                                      name TEXT NOT NULL,
                                      is_custom BOOLEAN DEFAULT 0,
                                      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                                      FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE
    );

CREATE TABLE IF NOT EXISTS prompts (
                                       id INTEGER PRIMARY KEY AUTOINCREMENT,
                                       business_id INTEGER NOT NULL,
                                       topic_id INTEGER,
                                       text TEXT NOT NULL,
                                       is_custom BOOLEAN DEFAULT 0,
                                       created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                                       FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE,
    FOREIGN KEY (topic_id) REFERENCES topics(id) ON DELETE SET NULL
    );

CREATE TABLE IF NOT EXISTS competitors (
                                           id INTEGER PRIMARY KEY AUTOINCREMENT,
                                           business_id INTEGER NOT NULL,
                                           name TEXT NOT NULL,
                                           website TEXT,
                                           visibility_score INTEGER,
                                           selected BOOLEAN DEFAULT 1,
                                           is_custom BOOLEAN DEFAULT 0,
                                           created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                                           FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE
    );

CREATE TABLE IF NOT EXISTS onboarding_sessions (
                                                   id INTEGER PRIMARY KEY AUTOINCREMENT,
                                                   business_id INTEGER NOT NULL,
                                                   step_completed INTEGER DEFAULT 1,
                                                   completed BOOLEAN DEFAULT 0,
                                                   completed_at DATETIME,
                                                   created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                                                   updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                                                   FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE
    );

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_topics_business_id ON topics(business_id);
CREATE INDEX IF NOT EXISTS idx_prompts_business_id ON prompts(business_id);
CREATE INDEX IF NOT EXISTS idx_competitors_business_id ON competitors(business_id);
CREATE INDEX IF NOT EXISTS idx_onboarding_sessions_business_id ON onboarding_sessions(business_id);