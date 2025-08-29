-- IntensifyHQ Database Schema for Cloudflare D1
-- Copy and paste this entire file into D1 Console

-- Users table
CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    stripe_customer_id TEXT,
    subscription_status TEXT DEFAULT 'inactive',
    subscription_end DATE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Tasks table (main log)
CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    date DATE NOT NULL,
    time_start TIME NOT NULL,
    task_name TEXT NOT NULL,
    minutes INTEGER NOT NULL DEFAULT 25,
    is_frog BOOLEAN DEFAULT 0,
    is_pr BOOLEAN DEFAULT 0,
    burn INTEGER CHECK(burn >= 1 AND burn <= 10),
    intensity INTEGER CHECK(intensity >= 1 AND intensity <= 10),
    roi INTEGER CHECK(roi >= 1 AND roi <= 10),
    action TEXT DEFAULT 'Keep',
    notes TEXT,
    focus_score REAL,
    fear_rating INTEGER,
    satisfaction INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Task templates
CREATE TABLE IF NOT EXISTS task_templates (
    id TEXT PRIMARY KEY,
    user_id TEXT,
    category TEXT NOT NULL,
    task_name TEXT NOT NULL,
    default_intensity INTEGER,
    default_roi INTEGER,
    default_burn INTEGER,
    is_global BOOLEAN DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- User settings
CREATE TABLE IF NOT EXISTS user_settings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT UNIQUE NOT NULL,
    weight_intensity REAL DEFAULT 0.6,
    weight_roi REAL DEFAULT 0.3,
    weight_burn REAL DEFAULT 0.1,
    theme TEXT DEFAULT 'light',
    timezone TEXT DEFAULT 'UTC',
    daily_intensity_target INTEGER DEFAULT 8,
    notifications_enabled BOOLEAN DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Streaks table
CREATE TABLE IF NOT EXISTS streaks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    streak_type TEXT NOT NULL,
    current_streak INTEGER DEFAULT 0,
    best_streak INTEGER DEFAULT 0,
    last_date DATE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE(user_id, streak_type)
);

-- Badges table
CREATE TABLE IF NOT EXISTS badges (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    badge_type TEXT NOT NULL,
    badge_level TEXT,
    earned_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE(user_id, badge_type, badge_level)
);

-- Scoring guide (reference data)
CREATE TABLE IF NOT EXISTS scoring_guide (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    metric TEXT NOT NULL,
    score INTEGER NOT NULL,
    description TEXT NOT NULL,
    examples TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_tasks_user_date ON tasks(user_id, date);
CREATE INDEX IF NOT EXISTS idx_tasks_is_frog ON tasks(user_id, is_frog);
CREATE INDEX IF NOT EXISTS idx_tasks_is_pr ON tasks(user_id, is_pr);
CREATE INDEX IF NOT EXISTS idx_streaks_user ON streaks(user_id, streak_type);
CREATE INDEX IF NOT EXISTS idx_badges_user ON badges(user_id);

-- Insert default scoring guide data
INSERT OR IGNORE INTO scoring_guide (metric, score, description, examples) VALUES
-- Intensity scores
('Intensity', 1, 'Trivial task', 'Checking email, routine admin'),
('Intensity', 2, 'Very easy', 'Simple data entry, basic research'),
('Intensity', 3, 'Easy', 'Routine calls, standard reports'),
('Intensity', 4, 'Below average', 'Basic analysis, simple writing'),
('Intensity', 5, 'Average', 'Standard project work, regular meetings'),
('Intensity', 6, 'Above average', 'Complex analysis, detailed planning'),
('Intensity', 7, 'Challenging', 'Strategic decisions, difficult conversations'),
('Intensity', 8, 'Very challenging', 'Major presentations, complex problem-solving'),
('Intensity', 9, 'Extremely hard', 'Critical negotiations, breakthrough innovation'),
('Intensity', 10, 'Maximum effort', 'Career-defining moments, crisis management'),
-- ROI scores
('ROI', 1, 'Zero value', 'Wasteful activities, busywork'),
('ROI', 2, 'Minimal value', 'Low-priority admin, unnecessary meetings'),
('ROI', 3, 'Low value', 'Nice-to-have tasks, minor improvements'),
('ROI', 4, 'Below average', 'Support tasks, maintenance work'),
('ROI', 5, 'Average value', 'Standard deliverables, routine projects'),
('ROI', 6, 'Above average', 'Important projects, client work'),
('ROI', 7, 'High value', 'Revenue-generating, strategic initiatives'),
('ROI', 8, 'Very high value', 'Major deals, key relationships'),
('ROI', 9, 'Critical value', 'Game-changing projects, top priorities'),
('ROI', 10, 'Maximum impact', 'Mission-critical, career-defining work'),
-- Burn scores
('Burn', 1, 'Energizing', 'Work that gives you energy'),
('Burn', 2, 'Very light', 'Easy focus, enjoyable work'),
('Burn', 3, 'Light', 'Comfortable pace, sustainable'),
('Burn', 4, 'Below average', 'Some effort required'),
('Burn', 5, 'Average', 'Normal energy expenditure'),
('Burn', 6, 'Above average', 'Requires focus and energy'),
('Burn', 7, 'Taxing', 'Draining but manageable'),
('Burn', 8, 'Very taxing', 'Exhausting, need recovery after'),
('Burn', 9, 'Extreme', 'Push to limits, rare occasions'),
('Burn', 10, 'Maximum burn', 'Total exhaustion, emergency only');

-- Insert default task templates
INSERT OR IGNORE INTO task_templates (id, category, task_name, default_intensity, default_roi, default_burn, is_global) VALUES
('t1', 'Deep Work', 'Strategic Planning', 8, 9, 7, 1),
('t2', 'Deep Work', 'Complex Problem Solving', 9, 8, 8, 1),
('t3', 'Deep Work', 'Creative Design', 7, 7, 6, 1),
('t4', 'Deep Work', 'Writing/Documentation', 6, 7, 5, 1),
('t5', 'Meetings', 'Client Meeting', 6, 8, 5, 1),
('t6', 'Meetings', 'Team Standup', 3, 5, 2, 1),
('t7', 'Meetings', '1-on-1', 5, 6, 4, 1),
('t8', 'Meetings', 'Strategy Session', 8, 9, 7, 1),
('t9', 'Admin', 'Email Processing', 2, 3, 2, 1),
('t10', 'Admin', 'Expense Reports', 3, 2, 3, 1),
('t11', 'Admin', 'Calendar Management', 2, 4, 2, 1),
('t12', 'Learning', 'Course/Training', 5, 8, 4, 1),
('t13', 'Learning', 'Reading/Research', 4, 7, 3, 1),
('t14', 'Sales', 'Cold Outreach', 7, 8, 7, 1),
('t15', 'Sales', 'Proposal Writing', 7, 9, 6, 1),
('t16', 'Sales', 'Follow-up', 4, 6, 3, 1);
