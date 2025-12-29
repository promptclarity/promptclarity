# How Prompt Clarity Works

## 📋 Table of Contents
1. [Overview](#overview)
2. [Complete User Journey](#complete-user-journey)
3. [System Architecture](#system-architecture)
4. [Data Flow](#data-flow)
5. [Key Components](#key-components)
6. [Automated Scheduling](#automated-scheduling)
7. [Technical Deep Dive](#technical-deep-dive)

---

## Overview

Prompt Clarity tracks how often your brand appears in AI-powered search results across multiple AI platforms (ChatGPT, Claude, Gemini, Perplexity, Grok). It monitors brand mentions, analyzes competitor visibility, and provides analytics on your "share of voice" in the AI space.

### The Core Problem It Solves
When users ask AI chatbots questions like "What are the best project management tools?" or "Compare CRM software," your brand either appears in the answer or it doesn't. This app tracks:
- **Visibility**: Is your brand mentioned at all?
- **Position**: Where do you rank compared to competitors?
- **Share of Voice**: What percentage of mentions are yours vs competitors?
- **Sentiment**: How are you being described?
- **Trends**: How is this changing over time?

---

## Complete User Journey

### Phase 1: Onboarding (5 Steps)

```
Step 1: Business Info
├─ Enter business name (e.g., "Acme Corp")
└─ Enter website (e.g., "acme.com")
   ↓
Step 2: AI Platform Configuration
├─ Select which AI platforms to track (ChatGPT, Claude, Gemini, etc.)
├─ Enter API keys for each platform
└─ Mark one as "primary" (used for AI generation)
   ↓
Step 3: Topics Generation
├─ AI analyzes your business and website
├─ Generates 5-10 relevant topics
├─ Examples: "Project Management", "Team Collaboration", "Workflow Automation"
└─ User can add/edit/remove topics
   ↓
Step 4: Prompts Generation
├─ For each topic, AI generates 3-5 search prompts
├─ Examples:
│  ├─ "What are the best project management tools?"
│  ├─ "Compare Acme vs Competitor for team collaboration"
│  └─ "Best workflow automation software in 2025"
└─ User can add/edit/remove prompts
   ↓
Step 5: Competitor Identification
├─ AI identifies 3-10 competitors in your space
├─ Examples: "Competitor A", "Competitor B", "Competitor C"
└─ User can add/edit/remove competitors
   ↓
Completion
├─ All data saved to SQLite database
├─ Onboarding marked as complete
└─ TRIGGERS FIRST EXECUTION (all prompts, all platforms)
```

### Phase 2: Initial Execution (Automatic)

When onboarding completes, the system immediately:

```
For Each Prompt:
  For Each AI Platform:
    1. Create execution record (status: pending)
    2. Call AI model with the prompt
    3. Receive response from AI
    4. Analyze response for brand mentions
    5. Calculate metrics
    6. Store results
    7. Send real-time update to UI
```

**Example Execution:**
- **Prompt**: "What are the best project management tools?"
- **Platform**: ChatGPT
- **AI Response**: "Top tools include: 1) Asana for enterprise teams, 2) Monday.com for flexibility, 3) Acme for small businesses..."
- **Analysis**:
  - Brand mentioned: ✅ Yes
  - Position: #3
  - Competitors mentioned: Asana, Monday.com
  - Sentiment: Positive
  - Share of Voice: 33% (1 out of 3 brands)

### Phase 3: Dashboard Usage (Ongoing)

After initial setup, users have access to multiple dashboards:

#### **Overview Dashboard** (`/dashboard/overview`)
- **Visibility Trends Chart**: Line graph showing how often each brand appears over time
- **Brand Rankings**: Table ranking all brands by visibility percentage
- **Recent Responses**: Latest AI outputs with brand mentions highlighted
- **Date Filtering**: View data for last 7/14/30 days or custom range

#### **Prompts Dashboard** (`/dashboard/prompts`)
- **Topic Organization**: Prompts grouped by topics
- **Execution History**: See all past executions for each prompt
- **Bulk Actions**:
  - Execute All - Run all prompts again
  - Select & Execute - Choose specific prompts to re-run
  - Individual Execute - Re-run single prompts
- **Response Management**: Delete individual responses (recalculates averages)
- **Real-time Updates**: Blue banner shows execution progress

#### **Competitors Dashboard** (`/dashboard/competitors`)
- Comparative analysis of all tracked brands
- Visibility benchmarking

#### **Sources Dashboard** (`/dashboard/sources`)
- See which websites AI models cite
- Track source domains and URLs
- Analyze citation patterns

#### **Sentiment Dashboard** (`/dashboard/sentiment`)
- Sentiment analysis of brand mentions
- Positive/negative/neutral breakdown

#### **Content Roadmap** (`/dashboard/content-roadmap`)
- AI-generated content recommendations
- Improve your visibility with suggested actions

#### **Team Dashboard** (`/dashboard/team`)
- Invite team members
- Manage roles and permissions

#### **Models Dashboard** (`/dashboard/models`)
- Configure AI platform API keys
- Enable/disable platforms
- View usage and costs

#### **Settings Dashboard** (`/dashboard/settings`)
- Configure execution schedule
- Business settings
- Account management

### Phase 4: Automated Execution (Background)

```
Internal Scheduler (node-cron):
├─ Checks every 5 minutes for businesses due for execution
├─ Each business has a configurable refresh period (e.g., daily, weekly)
├─ When next_execution_time <= now:
│  ├─ Get all active prompts for that business
│  ├─ Get all configured AI platforms
│  ├─ Execute all prompts across all platforms
│  ├─ Store results with today's date
│  └─ Set next_execution_time = now + refresh_period
└─ New data points added to historical trends

Result:
├─ New visibility percentages calculated
├─ Charts updated with new data point
├─ Brand rankings refreshed
└─ Share of voice trends updated
```

**Why Automated Scheduling?**
- Track how AI models change over time
- Monitor if your visibility is improving or declining
- See impact of marketing efforts on AI presence
- Detect when competitors gain/lose traction
- Configurable per-business refresh periods

---

## System Architecture

### Frontend (React/Next.js)

```
app/
├── page.tsx                    # Landing/routing page
├── components/                 # Reusable UI components
│   ├── DateRangeFilter.tsx    # Date selection component
│   └── VisibilityChart.tsx    # Chart component
├── contexts/
│   └── BusinessContext.tsx    # Global business state
└── dashboard/                  # Dashboard pages
    ├── layout.tsx             # Shared layout with sidebar
    ├── overview/page.tsx      # Overview dashboard
    ├── prompts/page.tsx       # Prompts management
    ├── competitors/page.tsx   # Competitor tracking
    ├── sources/page.tsx       # Source/citation analysis
    ├── sentiment/page.tsx     # Sentiment analysis
    ├── content-roadmap/page.tsx # Content recommendations
    ├── team/page.tsx          # Team management
    ├── models/page.tsx        # AI platform configuration
    └── settings/page.tsx      # Settings
```

### Backend (Next.js API Routes)

```
app/api/
├── auth/                      # Authentication endpoints
│   ├── [...nextauth]/        # NextAuth.js handlers
│   ├── register/             # User registration
│   └── setup/                # Initial setup
├── onboarding/                # Onboarding flow endpoints
│   ├── business/route.ts     # Save business info
│   ├── platforms/route.ts    # Save platform configs
│   ├── topics/route.ts       # Generate/save topics
│   ├── prompts/route.ts      # Generate/save prompts
│   ├── competitors/route.ts  # Generate/save competitors
│   └── complete/route.ts     # Complete onboarding
├── prompts/
│   └── executions/
│       ├── route.ts          # Execute prompts (POST)
│       ├── [executionId]/    # Delete execution (DELETE)
│       ├── stream/route.ts   # Real-time updates (Server-Sent Events)
│       ├── status/route.ts   # Check execution status
│       └── reanalyze/route.ts # Re-analyze responses
├── dashboard/
│   ├── overview/route.ts     # Aggregate analytics
│   ├── prompts/route.ts      # Get all prompts with data
│   ├── competitors/route.ts  # Competitor data
│   ├── sources/route.ts      # Source/citation data
│   ├── benchmarking/route.ts # Benchmarking data
│   └── content-roadmap/route.ts # Content recommendations
├── team/                      # Team management
│   ├── members/route.ts      # List/manage members
│   └── invite/route.ts       # Send invitations
├── instance/                  # Self-hosted instance management
│   ├── status/route.ts       # Check initialization status
│   └── setup/route.ts        # Initialize instance
└── business/                  # Business management
    ├── route.ts              # Current business
    └── all/route.ts          # All businesses for user
```

### Database (SQLite)

```
data/store.db (8 tables)

1. businesses
   ├─ id, business_name, website
   └─ Stores company info

2. business_platforms
   ├─ id, business_id, platform_id, api_key, is_primary
   └─ API keys for AI platforms

3. topics
   ├─ id, business_id, name, is_custom
   └─ Categories for prompts

4. prompts
   ├─ id, business_id, topic_id, text, is_custom
   └─ Search queries to test

5. competitors
   ├─ id, business_id, name, website
   └─ Tracked competing brands

6. prompt_executions (CORE TABLE)
   ├─ id, business_id, prompt_id, platform_id
   ├─ status, result, error_message
   ├─ started_at, completed_at, refresh_date
   ├─ brand_mentions, competitors_mentioned
   ├─ mention_analysis (JSON)
   ├─ analysis_confidence
   ├─ business_visibility (0 or 1)
   ├─ share_of_voice (percentage)
   ├─ competitor_share_of_voice (JSON)
   └─ competitor_visibilities (JSON)

   This table stores every execution result with full metrics

7. onboarding_sessions
   ├─ Tracks onboarding progress
   └─ Prevents duplicate setups

8. (future) users, teams, etc.
```

### Configuration

```
config/
└── platforms/
    └── platforms.yaml         # AI model configurations (providers, models, pricing)

app/lib/
├── scheduler.ts               # Internal cron scheduler (node-cron)
├── db/
│   ├── database.ts           # SQLite connection & helpers
│   └── migrations/           # Database migrations
└── services/
    ├── prompt-execution.service.ts  # Execution engine
    └── ai.service.ts                # AI platform integrations
```

---

## Data Flow

### Flow 1: Executing a Prompt

```
USER CLICKS "EXECUTE" BUTTON
         ↓
[Frontend] POST /api/prompts/executions
         ↓
[Backend] promptExecutionService.executeSinglePrompt()
         ↓
    ┌────────────────────────────────┐
    │ FOR EACH PLATFORM:             │
    │                                │
    │ 1. CREATE EXECUTION RECORD     │
    │    ├─ status: pending          │
    │    ├─ started_at: now()        │
    │    └─ INSERT INTO database     │
    │         ↓                      │
    │ 2. CALL AI PLATFORM            │
    │    ├─ Use platform API key     │
    │    ├─ Send prompt text         │
    │    └─ Receive AI response      │
    │         ↓                      │
    │ 3. ANALYZE RESPONSE            │
    │    ├─ Extract brand mentions   │
    │    ├─ Find competitor mentions │
    │    ├─ Determine positions      │
    │    └─ Assess sentiment         │
    │         ↓                      │
    │ 4. CALCULATE METRICS           │
    │    ├─ Visibility: 0 or 1       │
    │    ├─ Share of Voice: %        │
    │    └─ Competitor metrics       │
    │         ↓                      │
    │ 5. STORE RESULTS               │
    │    ├─ UPDATE execution record  │
    │    ├─ status: completed        │
    │    ├─ Save all metrics         │
    │    └─ completed_at: now()      │
    │         ↓                      │
    │ 6. SEND REAL-TIME UPDATE       │
    │    └─ EventSource → Frontend   │
    │                                │
    └────────────────────────────────┘
         ↓
[Frontend] Receives update via EventSource
         ↓
[UI] Updates automatically:
    ├─ Blue banner updates count
    ├─ New row appears in history table
    ├─ Chart adds new data point
    └─ Metrics recalculate
```

### Flow 2: AI Response Analysis (The Brain)

This is the critical part that extracts intelligence from AI responses:

```
AI RESPONSE:
"Top project management tools include:
1. Asana - Great for enterprise teams
2. Acme - Best for small businesses
3. Monday.com - Excellent flexibility"

         ↓
[STEP 1] Call AI with Structured Output Schema
         ↓
Request to AI:
{
  systemPrompt: "Analyze this AI response for brand mentions",
  userPrompt: "Extract rankings, mentions, and sentiment",
  schema: RankingSchema {
    brandMentioned: boolean,
    brandPosition: number,
    rankings: [{position, company, sentiment}],
    confidence: 0-1
  }
}
         ↓
[STEP 2] AI Returns Structured Data
         ↓
{
  brandMentioned: true,
  brandPosition: 2,
  rankings: [
    {position: 1, company: "Asana", sentiment: "positive"},
    {position: 2, company: "Acme", sentiment: "positive"},
    {position: 3, company: "Monday.com", sentiment: "positive"}
  ],
  competitorsMentioned: ["Asana", "Monday.com"],
  confidence: 0.95
}
         ↓
[STEP 3] Calculate Visibility
         ↓
business_visibility = brandMentioned ? 1 : 0
competitor_visibilities = {
  "Asana": 1,
  "Monday.com": 1
}
         ↓
[STEP 4] Calculate Share of Voice
         ↓
totalBrands = 3 (Acme + 2 competitors)
share_of_voice = (1 / 3) * 100 = 33.3%
competitor_share_of_voice = {
  "Asana": 33.3%,
  "Monday.com": 33.3%
}
         ↓
[STEP 5] Store Complete Analysis
         ↓
Database stores:
├─ Raw AI response
├─ Parsed analysis (JSON)
├─ All calculated metrics
└─ Confidence score
```

### Flow 3: Dashboard Data Aggregation

```
USER OPENS OVERVIEW PAGE
         ↓
[Frontend] GET /api/dashboard/overview?businessId=1&startDate=...&endDate=...
         ↓
[Backend] Query all executions in date range
         ↓
    ┌──────────────────────────────────────┐
    │ FOR EACH DAY IN RANGE:               │
    │                                      │
    │ 1. Group executions by date          │
    │    ├─ "2025-01-15" → 24 executions  │
    │    ├─ "2025-01-16" → 24 executions  │
    │    └─ "2025-01-17" → 24 executions  │
    │         ↓                            │
    │ 2. Calculate daily averages          │
    │    For Acme on 2025-01-15:          │
    │    ├─ 18 out of 24 mentioned = 75%  │
    │    └─ Average position: #2.3         │
    │    For Asana on 2025-01-15:         │
    │    ├─ 20 out of 24 mentioned = 83%  │
    │    └─ Average position: #1.8         │
    │         ↓                            │
    │ 3. Format for chart                 │
    │    dailyVisibility = [              │
    │      {                               │
    │        date: "2025-01-15",          │
    │        Acme: 75,                    │
    │        Asana: 83,                   │
    │        Monday: 45                   │
    │      },                              │
    │      {...}                           │
    │    ]                                 │
    │         ↓                            │
    │ 4. Rank brands by overall visibility│
    │    brandRankings = [                │
    │      {name: "Asana", visibility: 83%},    │
    │      {name: "Acme", visibility: 75%},     │
    │      {name: "Monday", visibility: 45%}    │
    │    ]                                 │
    │         ↓                            │
    │ 5. Get recent responses              │
    │    recentExecutions = [             │
    │      {result: "...", brands: [...]} │
    │    ]                                 │
    │                                      │
    └──────────────────────────────────────┘
         ↓
[Frontend] Receives aggregated data
         ↓
[UI] Renders:
    ├─ Line chart with all brands
    ├─ Rankings table
    └─ Recent responses list
```

---

## Key Components

### 1. Prompt Execution Service (`app/lib/services/prompt-execution.service.ts`)

The core engine that handles all executions:

```typescript
class PromptExecutionService {
  // Execute all prompts for a business
  executeAllPrompts(businessId) {
    ├─ Get all prompts from database
    ├─ Get all active platforms
    ├─ Create job queue (prompt × platform combinations)
    └─ Execute with concurrency limit (max 5 parallel)
  }

  // Execute single prompt across all platforms
  executeSinglePrompt(businessId, promptId) {
    ├─ Get prompt details
    ├─ Get all active platforms
    └─ Execute on each platform
  }

  // Execute one job (prompt + platform)
  executeJob(job) {
    ├─ Create execution record
    ├─ Call AI platform API
    ├─ Analyze response with AI
    ├─ Calculate metrics
    ├─ Store results
    └─ Send real-time update
  }

  // Analyze AI response for brand mentions
  analyzeMentions(businessId, response) {
    ├─ Get business name & competitors
    ├─ Build analysis prompt
    ├─ Call AI with structured output schema
    └─ Return parsed analysis
  }
}
```

### 2. Real-Time Updates (EventSource/Server-Sent Events)

```typescript
// Frontend establishes connection
const eventSource = new EventSource('/api/prompts/executions/stream');

eventSource.onmessage = (event) => {
  const data = JSON.parse(event.data);

  if (data.status === 'started') {
    // Mark prompt as executing
    setExecutingPrompts(prev => prev.add(data.promptId));
  }

  if (data.status === 'completed') {
    // Update UI with new results
    updatePromptData(data);
    // Remove from executing list
    setExecutingPrompts(prev => {
      prev.delete(data.promptId);
      return new Set(prev);
    });
  }
};

// Backend sends updates
class ConnectionManager {
  private connections = new Map<number, Set<Response>>();

  sendUpdate(businessId, data) {
    const connections = this.connections.get(businessId) || new Set();
    connections.forEach(res => {
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    });
  }
}
```

### 3. Date Range Handling

The app handles date filtering carefully to ensure consistency:

```typescript
function getDateRange(option: string) {
  const now = new Date();

  // Always use UTC and include full days
  const endDate = new Date(Date.UTC(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    23, 59, 59, 999
  )).toISOString();

  let startDate;
  switch(option) {
    case '7d':
      // 7 days ago at midnight
      startDate = new Date(Date.UTC(
        now.getFullYear(),
        now.getMonth(),
        now.getDate() - 6,
        0, 0, 0, 0
      )).toISOString();
      break;
    // ... other cases
  }

  return { startDate, endDate };
}
```

### 4. Metrics Calculation

```typescript
// Visibility: Binary (mentioned or not)
businessVisibility = brandMentions > 0 ? 1 : 0

// Share of Voice: Percentage of total mentions
totalMentions = brandMentions + sum(competitorMentions)
shareOfVoice = (brandMentions / totalMentions) * 100

// Average Position: Mean ranking across all mentions
positions = [2, 1, 3, 2, 1]  // From different executions
averagePosition = sum(positions) / positions.length

// Daily Visibility: Average across all executions that day
executionsToday = 24  // 4 prompts × 6 platforms
mentionsToday = 18    // Times brand appeared
dailyVisibility = (mentionsToday / executionsToday) * 100
```

---

## Automated Scheduling

### Internal Scheduler (node-cron)

The app uses an internal scheduler that runs within the Next.js server process:

```typescript
// app/lib/scheduler.ts
- Uses node-cron to check every 5 minutes
- Each business has next_execution_time and refresh_period_days
- When next_execution_time <= now, execution triggers
- After execution, next_execution_time = now + refresh_period_days
```

### Scheduler Flow

```
Every 5 minutes - Scheduler checks for due businesses
         ↓
[Query] SELECT * FROM businesses WHERE next_execution_time <= now
         ↓
[Loop] For each due business:
  ├─ Get all prompts
  ├─ Get all platforms
  ├─ Execute all prompts
  ├─ Store with today's refresh_date
  └─ Update next_execution_time
         ↓
[Log] Execution complete, next run scheduled
```

### Configuration

```bash
# Environment variable (optional)
CRON_SCHEDULE="*/5 * * * *"  # Check every 5 minutes (default)
```

Each business can have its own refresh period configured in settings (e.g., daily, every 3 days, weekly).

---

## Technical Deep Dive

### Why SQLite?

- **Simple deployment**: Single file database
- **No separate server**: Embedded in app
- **Fast for reads**: Perfect for analytics queries
- **Easy backups**: Just copy the file
- **Good for < 1M rows**: This app stores ~100k rows max

### Why Server-Sent Events (EventSource)?

- **One-way updates**: Server → Client (perfect for our use case)
- **Automatic reconnection**: Built into browsers
- **Simple implementation**: No WebSocket complexity
- **Works through proxies**: Uses standard HTTP

### Why Structured Output for AI Analysis?

```typescript
// Instead of parsing freeform text:
"Your brand appears at position #2 with positive sentiment"

// We get structured data:
{
  brandPosition: 2,
  sentiment: "positive",
  confidence: 0.95
}
```

Benefits:
- **Reliable**: No parsing errors
- **Type-safe**: Validated schema
- **Consistent**: Always same format
- **Queryable**: Easy to aggregate

### Why Recharts?

- **React-native**: Built for React
- **Responsive**: Adapts to screen size
- **Customizable**: Full control over styling
- **Lightweight**: Small bundle size

### Why Radix UI?

- **Accessible**: WCAG compliant
- **Unstyled**: Full design control
- **Composable**: Build complex UIs
- **Type-safe**: Great TypeScript support

---

## Summary

This application creates a **continuous monitoring system** for your brand's visibility in AI-powered search results. It:

1. **Sets up tracking** via guided onboarding
2. **Executes prompts** across multiple AI platforms
3. **Analyzes responses** using AI to extract structured data
4. **Calculates metrics** (visibility, position, share of voice)
5. **Stores historical data** for trend analysis
6. **Displays insights** in interactive dashboards
7. **Automates execution** on configurable schedules to track changes over time

The result is a comprehensive view of how AI models perceive and recommend your brand, enabling data-driven decisions about AI presence and positioning.
