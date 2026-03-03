-- FieldConnect Intelligence Layer Schema
-- Run this on Railway PostgreSQL instance
-- No extensions required - uses standard PostgreSQL types

-- Create isolated schema for intelligence layer
CREATE SCHEMA IF NOT EXISTS intelligence;

-- Core table: every RFI, punch item, observation ingested
CREATE TABLE IF NOT EXISTS intelligence.items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL,
    source_project_id TEXT NOT NULL,
    source_project_name TEXT,
    source_type TEXT NOT NULL CHECK (source_type IN ('rfi', 'punch_list', 'observation', 'daily_log', 'event')),
    source_ref TEXT,                    -- original RFI number, punch item ID, etc.

    raw_text TEXT NOT NULL,             -- original description
    normalized_text TEXT,               -- cleaned, abbreviations expanded

    -- Phase awareness (populated from project schedule)
    project_phase TEXT,                 -- foundation, structure, envelope, mep_rough, finishes, closeout
    phase_percentage FLOAT,             -- 0.0 to 1.0, position in project timeline
    item_date DATE,                     -- when this item was created/logged

    -- Classification
    trade_category TEXT,                -- electrical, mechanical, concrete, curtainwall, etc.
    issue_type TEXT,                    -- design, workmanship, coordination, code_compliance, material_defect
    severity TEXT,                      -- low, medium, high, critical

    -- Outcome data (if available)
    resolution_text TEXT,
    cost_impact NUMERIC,
    schedule_impact_days INTEGER,
    resulted_in_co BOOLEAN DEFAULT FALSE,

    -- Privacy-safe abstracted summary (cached)
    abstracted_summary TEXT,

    -- Embedding stored as float array (1536 dimensions from OpenAI text-embedding-3-small)
    -- Similarity computed in Python using numpy for flexibility at this scale
    embedding FLOAT8[],

    -- Metadata
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Extracted entities linked to items
CREATE TABLE IF NOT EXISTS intelligence.entities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    item_id UUID NOT NULL REFERENCES intelligence.items(id) ON DELETE CASCADE,
    entity_type TEXT NOT NULL,          -- person, company, material, brand, spec_section,
                                        -- location, drawing_ref, trade, inspector
    entity_value TEXT NOT NULL,         -- raw extracted value
    normalized_value TEXT,              -- after terminology normalization
    confidence FLOAT DEFAULT 1.0,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Project schedules for phase mapping (activity-level detail)
CREATE TABLE IF NOT EXISTS intelligence.project_schedules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL,
    project_id TEXT NOT NULL,
    activity_id TEXT,                    -- WBS code or activity ID from source schedule
    activity_name TEXT NOT NULL,         -- activity/task description
    phase TEXT,                          -- mapped phase: foundation, structure, envelope, mep_rough_in, etc.
    start_date DATE,
    end_date DATE,
    duration_days INTEGER,
    predecessors TEXT,                   -- predecessor activity IDs
    created_at TIMESTAMP DEFAULT NOW()
);

-- Index for schedule queries
CREATE INDEX IF NOT EXISTS idx_schedules_project_company
    ON intelligence.project_schedules(project_id, company_id);

-- Alert feedback for learning loop
CREATE TABLE IF NOT EXISTS intelligence.feedback (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    alert_item_id UUID REFERENCES intelligence.items(id),
    trigger_text TEXT,                   -- what the user said that triggered the alert
    action TEXT CHECK (action IN ('seen', 'expanded', 'helpful', 'not_helpful', 'dismissed')),
    user_id UUID,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for performance
-- Note: No vector index needed - similarity computed in Python at this scale
CREATE INDEX IF NOT EXISTS idx_items_company ON intelligence.items(company_id);
CREATE INDEX IF NOT EXISTS idx_items_phase ON intelligence.items(project_phase);
CREATE INDEX IF NOT EXISTS idx_items_trade ON intelligence.items(trade_category);
CREATE INDEX IF NOT EXISTS idx_items_type ON intelligence.items(source_type);
CREATE INDEX IF NOT EXISTS idx_items_date ON intelligence.items(item_date);
CREATE INDEX IF NOT EXISTS idx_items_project ON intelligence.items(source_project_id);
CREATE INDEX IF NOT EXISTS idx_entities_item ON intelligence.entities(item_id);
CREATE INDEX IF NOT EXISTS idx_entities_type_value ON intelligence.entities(entity_type, normalized_value);
CREATE INDEX IF NOT EXISTS idx_feedback_item ON intelligence.feedback(alert_item_id);
