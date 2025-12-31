# Prompt Clarity Architecture Guide

This guide explains how the application works in plain language. No coding knowledge required. You'll learn how each part works, how they connect, and how to troubleshoot or extend the system.

---

## Table of Contents

1. [The Big Picture](#the-big-picture)
2. [How Data Flows](#how-data-flows)
3. [User Journey: Step by Step](#user-journey-step-by-step)
4. [Core Systems Explained](#core-systems-explained)
5. [Troubleshooting Guide](#troubleshooting-guide)
6. [How to Add New Features](#how-to-add-new-features)
7. [Technical Terms Glossary](#technical-terms-glossary)

---

## The Big Picture

### What This Application Does

Think of this app as a **brand monitoring robot** that:
1. Asks AI platforms (like ChatGPT) questions about your business
2. Checks if the AI mentions your brand in the answer
3. Tracks how often you're mentioned compared to competitors
4. Shows you trends over time in charts and graphs

### The Three Main Parts

```
┌─────────────────────────────────────────────────────────────┐
│                        THE APPLICATION                       │
├─────────────────┬───────────────────┬──────────────────────┤
│   FRONTEND      │      BACKEND      │      DATABASE        │
│   (What users   │   (The brain/     │   (Where we store    │
│    see)         │    processor)     │    everything)       │
├─────────────────┼───────────────────┼──────────────────────┤
│ • Web pages     │ • Processes       │ • Business info      │
│ • Buttons       │   requests        │ • AI responses       │
│ • Charts        │ • Talks to AI     │ • Metrics            │
│ • Forms         │ • Calculates data │ • History            │
└─────────────────┴───────────────────┴──────────────────────┘
```

**Simple Analogy:**
- **Frontend** = The storefront (what customers see and interact with)
- **Backend** = The kitchen (where the actual work happens)
- **Database** = The filing cabinet (where we keep all records)

---

## How Data Flows

### Pattern 1: Simple Request (Like Ordering Food)

```
1. User clicks a button
   ↓
2. Frontend sends request to Backend
   ↓
3. Backend gets data from Database
   ↓
4. Backend sends response to Frontend
   ↓
5. Frontend displays data to user
```

**Real Example: Loading the Dashboard**
- You open the dashboard page
- Frontend asks Backend: "Get me analytics for last 7 days"
- Backend asks Database: "Find all AI responses from last 7 days"
- Database returns the data
- Backend calculates averages and percentages
- Backend sends results to Frontend
- Frontend draws charts and shows you the results

**Timeline:** Usually takes 100-500 milliseconds (less than 1 second)

---

### Pattern 2: Long Operations (Like Ordering Catering)

This is different because AI processing takes a long time (5-10 minutes).

```
1. User clicks "Execute All Prompts"
   ↓
2. Frontend sends request to Backend
   ↓
3. Backend says "OK, I'll start" and returns IMMEDIATELY
   ↓
4. Backend works in background (doesn't make user wait)
   ↓
5. As Backend completes each task, it sends updates
   ↓
6. Frontend shows progress in real-time
```

**Why This Way?**
- If Backend made you wait, the connection would timeout (like a phone call that's too long gets disconnected)
- By working in background, user gets immediate feedback
- Real-time updates show progress as work happens

**Real Example: Execute All Prompts**
1. You click "Execute All"
2. Backend responds instantly: "Started executing 24 prompts"
3. You see a blue banner: "Executing 24 prompts..."
4. Backend creates 24 jobs and starts running them (max 5 at a time)
5. Every time one finishes, Backend sends an update
6. Your screen updates automatically showing new results
7. Banner counts down: "Executing 19 prompts... 14 prompts... 5 prompts..."
8. After 5-10 minutes, all done!

**Timeline:** 5-10 minutes for 24 prompts, but you see progress the whole time

---

## User Journey: Step by Step

### 1. Opening the App for First Time

**What You See:**
- Landing page with "Get Started" button

**What Happens Behind the Scenes:**

```
Page loads → Check browser storage → Decision
              ↓
              Is onboarding complete?
              ↓
         Yes ─┴─ No
          │      │
     Dashboard  Landing Page
```

**Technical Detail:**
- App checks `localStorage` (browser's memory)
- Looks for two things:
  - `onboardingBusinessId` (your business ID number)
  - `onboardingComplete` (true/false flag)
- If both exist → skip to dashboard
- If missing → show onboarding

**Why It Matters:**
- User doesn't have to log in every time
- App remembers where you left off
- Fast loading (no server calls needed)

---

### 2. Onboarding: Setting Up Your Business

Think of onboarding as **filling out a registration form** that AI helps you complete.

#### Step 1: Business Information

**What You Do:**
- Enter business name (e.g., "Acme Corp")
- Enter website (e.g., "acme.com")
- Click "Next"

**What Happens:**

```
Frontend                Backend                 Database
   │                       │                        │
   │─ Send business info ─>│                        │
   │                       │─ Create business ────>│
   │                       │                       [NEW]
   │                       │                    Business #1
   │                       │                    Name: Acme Corp
   │                       │<─ Return ID 1 ───────│
   │<─ Success + ID 1 ─────│                        │
   │                       │                        │
[Save ID to memory]        │                        │
```

**Database Changes:**
- Creates new row in `businesses` table
- Creates tracking record in `onboarding_sessions` table
- Saves ID #1 for this business

**Why We Save the ID:**
- All next steps need to know which business you're setting up
- Like getting a ticket number at a deli counter

---

#### Step 2: Connect AI Platforms

**What You Do:**
- Select which AI platforms you want to query (ChatGPT, Claude, etc.)
- Enter your API keys (like passwords for those platforms)
- Mark one as "primary" (the main one to use)
- Click "Next"

**What Happens:**

```
Frontend                Backend                 Database
   │                       │                        │
   │─ Send platforms ─────>│                        │
   │  [{ChatGPT,           │                        │
   │    key: sk-...}]      │                        │
   │                       │─ Delete old ─────────>│
   │                       │  (if any exist)        │
   │                       │                        │
   │                       │─ Save new ──────────>│
   │                       │                       [NEW]
   │                       │                    Platform #1
   │                       │                    Type: ChatGPT
   │                       │                    API Key: sk-...
   │                       │                    Primary: Yes
   │<─ Success ────────────│                        │
```

**What's an API Key?**
- Like a password that lets this app use AI on your behalf
- You get it from OpenAI, Anthropic, etc.
- Stored securely in database
- Used every time we query that AI

**Database Changes:**
- First deletes any existing platforms for your business
- Then saves new platform configuration
- Updates progress to step 2

**Why Delete First?**
- In case you come back and change your mind
- Ensures clean data (no duplicates)
- Called "idempotent" (fancy word for "safe to run multiple times")

---

#### Step 3: Topics (AI-Generated)

This is where it gets interesting! AI helps you.

**What You Do:**
1. Click "Generate Topics with AI"
2. Wait a few seconds
3. See AI-suggested topics appear
4. Edit if you want
5. Click "Next" to save

**What Happens - Phase 1 (Generation):**

```
Frontend          Backend           AI Service         OpenAI API
   │                 │                  │                  │
   │─ Generate ─────>│                  │                  │
   │                 │─ Get business ──>│                  │
   │                 │<─ Acme Corp ─────│                  │
   │                 │                  │                  │
   │                 │                  │─ Ask: "Generate ─>│
   │                 │                  │  topics for       │
   │                 │                  │  Acme Corp..."    │
   │                 │                  │                   │
   │                 │                  │<─ Response: ──────│
   │                 │                  │  1. Project Mgmt  │
   │                 │                  │  2. Team Collab.. │
   │                 │<─ Parsed list ───│                   │
   │<─ Display ──────│  (NOT SAVED YET) │                   │
   │                 │                  │                   │
[Show in UI]         │                  │                   │
[User can edit]      │                  │                   │
```

**Important:** Topics are NOT saved yet! You can edit them.

**What Happens - Phase 2 (Saving):**

When you click "Next":

```
Frontend          Backend           Database
   │                 │                  │
   │─ Save topics ──>│                  │
   │  [VPN, ZeroTrust]│                 │
   │                 │─ Delete old ────>│
   │                 │                  │
   │                 │─ Insert new ───>│
   │                 │                 [NEW]
   │                 │              Topic #1: VPN
   │                 │              Topic #2: Zero Trust
   │<─ Success ──────│                  │
```

**Why Two Phases?**
- Phase 1: AI generates suggestions (you can review)
- Phase 2: You decide what to keep (you have control)
- Gives you flexibility to customize

**What Are Topics?**
- Categories of questions you want to track
- Examples: "VPN Solutions", "Remote Work Tools", "Zero Trust Security"
- Later, we'll create specific questions for each topic

---

#### Step 4: Prompts (AI-Generated)

Prompts are the actual questions we'll ask AI platforms.

**What You Do:**
1. Click "Generate Prompts with AI"
2. AI creates 3-5 questions for each topic
3. Review and edit if needed
4. Click "Next" to save

**How AI Creates Prompts:**

```
AI receives:
- Business: "Acme Corp"
- Topics: ["Project Management", "Team Collaboration"]

AI generates:

Project Management:
  → "What are the best project management tools?"
  → "Compare Acme vs Asana for team projects"
  → "How to choose project management software for small business?"

Team Collaboration:
  → "What is team collaboration software and why use it?"
  → "Best collaboration tools for remote teams"
  → "Acme vs Monday.com for team workflows"
```

**Why These Specific Prompts?**
- They're natural questions people search for
- They include your brand name (so we can track mentions)
- They include competitors (to compare visibility)
- Mix of informational and comparison queries

**Database Storage:**

```
prompts table:
┌────┬──────────┬─────────┬────────────────────────────────────────┐
│ ID │ Business │ Topic   │ Text                                   │
├────┼──────────┼─────────┼────────────────────────────────────────┤
│ 1  │ 1        │ 1       │ What are the best project mgmt tools?  │
│ 2  │ 1        │ 1       │ Compare Acme vs Asana                  │
│ 3  │ 1        │ 2       │ What is team collaboration software?   │
└────┴──────────┴─────────┴────────────────────────────────────────┘
```

Each prompt links to a topic (notice Topic column references Topic #1, Topic #2)

---

#### Step 5: Competitors

**What You Do:**
1. Click "Generate Competitors with AI"
2. AI suggests competitor brands
3. Add or remove as needed
4. Click "Complete Onboarding"

**AI Analysis:**
```
AI looks at:
- Your business: Acme Corp
- Your topics: Project Management, Team Collaboration
- Your industry

AI suggests competitors:
- Asana
- Monday.com
- ClickUp
- Trello
```

**Why Track Competitors?**
- Compare your brand visibility to theirs
- See who dominates in AI responses
- Identify market positioning opportunities

---

#### Completing Onboarding - The Critical Moment

When you click "Complete Onboarding", something special happens:

**What You See:**
1. Click "Complete Onboarding"
2. Page redirects to dashboard IMMEDIATELY (< 1 second)
3. Blue banner appears: "Executing 24 prompts across AI platforms..."
4. Over next 5-10 minutes, results stream in
5. Charts populate as data arrives

**What Actually Happens:**

```
Step 1: Mark Complete (FAST - 100ms)
Frontend ─────> Backend ─────> Database
   │               │              │
   │               │─ Update ────>│
   │               │  complete=1  │
   │<─ Success! ───│              │
   │               │              │
   │          [RETURN TO USER]    │
   │               │              │

Step 2: Background Work Starts (SLOW - 5-10 min)
                │
                │─ Create 24 jobs
                │  (24 prompts × 1 platform)
                │
                │─ Execute jobs
                │  (max 5 at a time)
                │
                └─ Stream results
                   as they complete
```

**Why Split Into Two Steps?**

**The Problem:**
- Asking 24 questions to AI takes 5-10 minutes
- Web connections timeout after 10-60 seconds
- You'd see an error before work finishes

**The Solution:**
- Step 1: Quick confirmation (you get immediate feedback)
- Step 2: Long work happens in background
- Real-time updates show progress

**Analogy:**
- Like ordering food for delivery
- Restaurant confirms order immediately (Step 1)
- Food is prepared in background (Step 2)
- You get updates: "Your order is being prepared... Out for delivery..."

**Database Impact:**

After completion, you'll have:
- 24 rows in `prompt_executions` table
- Each row has:
  - The AI's response (full text)
  - Whether your brand was mentioned (1 or 0)
  - Which competitors were mentioned
  - Position/ranking in the response
  - Confidence score

---

## Core Systems Explained

### System 1: The Job Queue & Execution Engine

**What Is It?**
The part that asks AI platforms your questions and records the answers.

**How It Works:**

```
┌──────────────────────────────────────────────────────────┐
│                      JOB QUEUE                           │
├──────────────────────────────────────────────────────────┤
│                                                          │
│  Jobs = Prompts × Platforms                              │
│                                                          │
│  Example:                                                │
│  • 24 prompts × 1 platform (ChatGPT) = 24 jobs           │
│  • 24 prompts × 2 platforms = 48 jobs                    │
│                                                          │
│  Jobs run 5 at a time (concurrency limit)                │
│                                                          │
│  Job 1  Job 2  Job 3  Job 4  Job 5  ← Running           │
│  Job 6  Job 7  Job 8  ... Job 24    ← Waiting           │
│                                                          │
│  As one finishes, next one starts (rolling window)       │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

**Why Only 5 at a Time?**
- AI APIs have rate limits (maximum requests per minute)
- Running too many would trigger errors
- 5 is a safe balance between speed and reliability

**Single Job Flow (What Happens for Each Question):**

```
Step 1: Create Record
└─> Database gets new row: Status = "pending"

Step 2: Update Status
└─> Database row updated: Status = "running"

Step 3: Call AI Platform
└─> Send prompt to ChatGPT/Claude/etc.
└─> Example: "What are the best VPN solutions?"
└─> Wait for response (5-15 seconds)
└─> Get answer: "Top VPN solutions include..."

Step 4: Analyze Response (IMPORTANT!)
└─> Send response to analysis AI
└─> Use structured output (Zod schema)
└─> Extract:
    • How many times is your brand mentioned? (count)
    • What position? (1st, 2nd, 3rd brand mentioned?)
    • Which competitors mentioned? (Asana, Monday.com?)
    • Confidence: How sure is AI? (0-100%)

Step 5: Calculate Metrics
└─> Visibility: Was brand mentioned? (1=yes, 0=no)
└─> Share of Voice: % among all brands mentioned
    Example: 3 brands mentioned, yours is one = 33.3%
└─> Competitor Visibility: Same for each competitor

Step 6: Save Everything
└─> Update database row with:
    • Full AI response text
    • All metrics
    • Status = "completed"
    • Timestamp

Step 7: Notify Frontend
└─> Send real-time update via EventSource
└─> Frontend automatically shows new result
```

**Two AI Calls Per Job - Why?**

**Call 1: Get the Answer**
- Target: The AI platform you're testing (e.g., ChatGPT)
- Prompt: Your actual question
- Result: Natural language answer

**Call 2: Analyze the Answer**
- Target: Analysis AI (usually same as Call 1)
- Prompt: "Extract brand mentions from this text..."
- Result: Structured data (JSON format)

**Example:**

```
Call 1 Response:
"For project management tools, I'd recommend Asana for enterprise teams,
Monday.com for flexibility, or Acme if you need simple workflows
for small businesses."

Call 2 Analysis:
{
  "brands_mentioned": ["Asana", "Monday.com", "Acme"],
  "brand_positions": {
    "Asana": 1,
    "Monday.com": 2,
    "Acme": 3
  },
  "your_brand_mentioned": true,
  "confidence": 95
}
```

**Why Structured Output?**
- Can't just search for your brand in text (might appear in URLs, examples, etc.)
- AI understands context better
- Gets accurate position/ranking
- More reliable than text parsing

---

### System 2: Real-Time Updates (EventSource)

**What Is It?**
A persistent connection that lets the server push updates to your browser without you refreshing.

**How It Works:**

```
┌─────────────┐                          ┌─────────────┐
│   Browser   │                          │   Server    │
│             │                          │             │
│  Dashboard  │──1. Open Connection─────>│ Connection  │
│    Page     │                          │  Manager    │
│             │                          │             │
│             │<─2. Keep Open ───────────│ Store in    │
│             │   (stays connected)      │ memory map  │
│             │                          │             │
│             │                          │ [Job runs]  │
│             │                          │ [Completes] │
│             │                          │             │
│             │<─3. Push Update ─────────│ Send to all │
│  [Update    │   { status: completed    │ connected   │
│   state]    │     result: "..." }      │ browsers    │
│             │                          │             │
│  [Render    │                          │             │
│   new row]  │                          │             │
│             │                          │             │
└─────────────┘                          └─────────────┘
```

**Step by Step:**

1. **Opening Connection:**
   - Your browser opens `/api/prompts/executions/stream?businessId=1`
   - Server stores this connection in memory
   - Connection stays open (doesn't close like normal requests)

2. **Storing Connections:**
   - Server has a Map (like a phonebook)
   - Key = Business ID (e.g., 1)
   - Value = All browser connections for that business
   - Can support multiple users viewing same business

3. **Sending Updates:**
   - When a job completes, execution service calls:
     `connectionManager.sendUpdate(businessId, data)`
   - Connection manager looks up all connections for that business
   - Sends data to all of them simultaneously

4. **Receiving Updates:**
   - Browser gets event with data
   - Parses JSON
   - Updates React state
   - UI re-renders automatically
   - New row appears in table, chart updates, etc.

**Why This vs. Polling?**

**Polling (old way):**
```
Browser: "Any updates?"
Server: "No"
[Wait 2 seconds]
Browser: "Any updates?"
Server: "No"
[Wait 2 seconds]
Browser: "Any updates?"
Server: "Yes! Here's data"
```
- Wasteful (constant checking)
- Delayed (up to 2 seconds)
- More server load

**EventSource (our way):**
```
Browser: [Opens connection, waits]
Server: [Sends update when ready]
Browser: [Receives immediately]
```
- Efficient (no unnecessary requests)
- Instant (no delay)
- Less server load

**Analogy:**
- Polling = Checking mailbox every 5 minutes
- EventSource = Mail carrier knocks when delivery arrives

---

### System 3: Analytics & Aggregation

**What Is It?**
The system that takes raw AI responses and turns them into meaningful insights.

**Raw Data vs. Aggregated Data:**

**Raw Data** (in database):
```
prompt_executions table:
ID  | Prompt              | Date       | Brand Mentioned | Position
1   | Best VPN solutions? | 2024-11-20 | Yes            | 2
2   | Best VPN solutions? | 2024-11-19 | Yes            | 3
3   | Best VPN solutions? | 2024-11-18 | No             | NULL
4   | Zero trust options? | 2024-11-20 | Yes            | 1
...
```

**Aggregated Data** (what you see):
```
Dashboard shows:
• Visibility: 75% (mentioned in 3 out of 4 responses)
• Average Position: 2.0 (when mentioned)
• Trend: +10% vs. last week
```

**How Aggregation Works:**

```
Step 1: Filter Data
└─> Get all executions in date range
└─> Example: Last 7 days for Business #1
└─> Returns array of execution records

Step 2: Group by Date
└─> Create a Map (like a spreadsheet)
└─> Key = Date (e.g., "2024-11-20")
└─> Value = All executions on that date

Example Map:
{
  "2024-11-20": [exec1, exec2, exec3],
  "2024-11-19": [exec4, exec5],
  ...
}

Step 3: Calculate Daily Metrics
For each date:
└─> Count total executions
└─> Count times brand mentioned
└─> Calculate: (mentioned / total) × 100 = visibility %

Example:
Date: 2024-11-20
  Total: 10 executions
  Mentioned: 8 times
  Visibility: 80%

Step 4: Calculate Competitor Metrics
Same process for each competitor:
└─> Asana mentioned: 9/10 = 90%
└─> Monday.com mentioned: 5/10 = 50%

Step 5: Create Time Series
└─> Array of { date, business%, competitor1%, competitor2% }
└─> Sorted by date
└─> Ready for charting

Step 6: Calculate Rankings
└─> Sort all brands by visibility %
└─> Assign rank (1st, 2nd, 3rd...)

Step 7: Return to Frontend
└─> Structured JSON response
└─> Frontend renders charts and tables
```

**Example API Response:**

```json
{
  "dailyVisibility": [
    {
      "date": "2025-01-15",
      "business": 75.0,
      "competitors": {
        "Asana": 83.3,
        "Monday.com": 45.8
      }
    },
    {
      "date": "2025-01-14",
      "business": 70.0,
      "competitors": {
        "Asana": 80.0,
        "Monday.com": 50.0
      }
    }
  ],
  "brandRankings": [
    {
      "name": "Asana",
      "visibility": 83.3,
      "mentions": 20,
      "position": 1
    },
    {
      "name": "Acme",
      "visibility": 75.0,
      "mentions": 18,
      "position": 2
    }
  ]
}
```

**Frontend Rendering:**

Charts library (Recharts) takes this data and creates:
- Multi-line chart with one line per brand
- X-axis = dates
- Y-axis = visibility percentage
- Different color per brand

---

### System 4: Automated Scheduling

**What Is It?**
Automatic execution that runs based on each business's configured schedule.

**How It's Set Up:**

The app uses an internal scheduler (`app/lib/scheduler.ts`) that runs within the Next.js server:

```
- Uses node-cron to check every 5 minutes
- Each business has:
  - next_execution_time: When to run next
  - refresh_period_days: How often to run (1 = daily, 7 = weekly)
- Server restart safe (uses database timestamps, not memory)
```

**Cron Schedule Format:**
```
*/5 * * * *  (default - check every 5 minutes)
│   │ │ │ │
│   │ │ │ └─ Day of week
│   │ │ └─── Month
│   │ └───── Day of month
│   └─────── Hour
└─────────── Minute
```

**What Happens Every 5 Minutes:**

```
Step 1: Scheduler checks database
└─> SELECT * FROM businesses WHERE next_execution_time <= NOW()

Step 2: For each due business
└─> Get their prompts
└─> Get their configured platforms
└─> Execute all prompts (same as manual execution)
└─> Store results with today's date

Step 3: Update next execution time
└─> next_execution_time = NOW() + refresh_period_days
└─> Example: If daily, next run tomorrow

Step 4: Log completion
└─> "[Scheduler] Completed 24 prompts for Acme. Next execution: 2025-01-16"
```

**Why This Design?**
- Each business can have different schedules
- Survives server restarts (database-driven)
- No external dependencies (runs inside Next.js)
- Efficient (only checks every 5 minutes)

**Configuration:**

Set via environment variable (optional):
```bash
CRON_SCHEDULE="*/5 * * * *"  # Default: check every 5 minutes
```

Each business's refresh period is configured in their settings.

---

## Troubleshooting Guide

### Issue 1: "Execute All" Button Stays Pending

**Symptoms:**
- Click "Execute All" button
- Nothing happens
- Network tab shows request pending forever

**Root Cause:**
API is waiting for execution to complete (5-10 min) but connection times out first.

**How to Check:**
1. Open browser DevTools (F12)
2. Go to Network tab
3. Click "Execute All"
4. Look for `/api/prompts/executions` request
5. Does it stay "pending" for >60 seconds? → Problem confirmed

**The Fix:**
In `app/api/prompts/executions/route.ts`, ensure code does NOT await:

```javascript
// WRONG (causes timeout):
await promptExecutionService.executeAllPrompts(businessId);

// CORRECT (returns immediately):
promptExecutionService.executeAllPrompts(businessId).catch(error => {
  console.error('Error:', error);
});

return NextResponse.json({ success: true });
```

**Why This Works:**
- API returns success immediately (~100ms)
- Execution continues in background
- Results stream via EventSource

**How to Verify Fix:**
1. Click "Execute All"
2. Should see success response <1 second
3. Blue banner appears immediately
4. Results stream in over next few minutes

---

### Issue 2: Real-Time Updates Not Working

**Symptoms:**
- Click "Execute All"
- Blue banner shows
- But no results appear
- Must refresh page to see data

**Root Cause:**
EventSource connection not established or broken.

**How to Check:**
1. Open browser DevTools → Network tab
2. Filter by "EventStream" or search for "sse"
3. Should see `/api/prompts/executions/stream?businessId=1`
4. Status should be "pending" (connection stays open)
5. If not found or status is complete → Problem confirmed

**Possible Causes & Fixes:**

**Cause A: Connection Not Opening**
- Check: Is EventSource code running on page mount?
- Fix: Ensure `useEffect` hook runs and calls `openEventSource()`

**Cause B: Wrong Business ID**
- Check: URL has correct `businessId` parameter?
- Fix: Verify `localStorage.getItem('onboardingBusinessId')` returns valid ID

**Cause C: Server Not Sending Updates**
- Check: Server logs show "Sending update to business X"?
- Fix: Ensure `connectionManager.sendUpdate()` is called after job completion

**Cause D: Browser Blocking**
- Check: Any errors in browser console?
- Fix: Check for CORS issues or ad blockers

**How to Verify Fix:**
1. Open page
2. Check Network tab → should see open EventStream connection
3. Trigger execution
4. Check Network tab → Events tab → should see messages flowing
5. UI should update automatically

---

### Issue 3: Wrong Visibility Calculations

**Symptoms:**
- Dashboard shows 50% visibility
- But you know brand was mentioned in all responses
- Numbers don't match

**Root Cause:**
Several possible issues in aggregation logic.

**How to Check:**

**Step 1: Check Raw Data**
```sql
-- Run in database tool
SELECT
  COUNT(*) as total,
  SUM(business_visibility) as mentioned
FROM prompt_executions
WHERE business_id = 1
  AND refresh_date >= '2024-11-14'
  AND refresh_date <= '2024-11-20';
```

Expected:
- `total` = number of executions
- `mentioned` = times brand mentioned
- Visibility = (mentioned / total) × 100

**Step 2: Check Date Filtering**
- Ensure date range is correct
- Dates in UTC might differ from local time
- Check `refresh_date` vs `completed_at` (code should use `refresh_date`)

**Step 3: Check Status Filtering**
- Should only count `status='completed'`
- Pending/failed executions shouldn't affect metrics

**Common Fixes:**

**Fix A: Wrong Date Column**
```javascript
// WRONG
const date = exec.completed_at.split('T')[0];

// CORRECT
const date = exec.refresh_date || exec.completed_at.split('T')[0];
```

**Fix B: Not Filtering Status**
```javascript
// WRONG
const executions = getAllExecutions(businessId);

// CORRECT
const executions = getAllExecutions(businessId)
  .filter(e => e.status === 'completed');
```

**Fix C: Wrong Visibility Field**
```javascript
// WRONG (treats null as 0)
const mentioned = exec.business_visibility ? 1 : 0;

// CORRECT (handles null)
const mentioned = exec.business_visibility === 1 ? 1 : 0;
```

---

### Issue 4: AI Not Detecting Brand Mentions

**Symptoms:**
- AI response clearly mentions your brand
- But `business_visibility = 0`
- Analysis is wrong

**Root Cause:**
Analysis AI prompt or parsing logic has issues.

**How to Check:**

**Step 1: Look at Raw Response**
1. Open prompt details panel
2. Read full AI response
3. Is brand actually mentioned?

**Step 2: Check Analysis Data**
Database field `brand_mentions` should show:
```json
{
  "brandMentioned": true,
  "brandPosition": 2,
  "competitorsMentioned": ["Asana"],
  "confidence": 95
}
```

**Step 3: Test Analysis Directly**

In code, find the analysis prompt template.
Should look like:
```javascript
const analysisPrompt = `
Analyze this AI response and extract brand mentions.

Business: ${businessName}
Competitors: ${competitors.join(', ')}

Response:
"""
${aiResponse}
"""

Return JSON with:
- brandMentioned (boolean)
- brandPosition (number, 1-based)
- competitorsMentioned (array)
- confidence (0-100)
`;
```

**Common Fixes:**

**Fix A: Case Sensitivity**
```javascript
// WRONG
if (response.includes(businessName))

// CORRECT
if (response.toLowerCase().includes(businessName.toLowerCase()))
```

**Fix B: Partial Matches**
```javascript
// WRONG (matches "Netbird" in "netbird.io")
const mentioned = text.includes('Netbird');

// BETTER (word boundaries)
const mentioned = new RegExp(`\\b${businessName}\\b`, 'i').test(text);
```

**Fix C: Using Structured Output**
Instead of parsing text, use Zod schema:
```javascript
const analysis = await generateObject({
  model: openai('gpt-4-turbo'),
  schema: z.object({
    brandMentioned: z.boolean(),
    brandPosition: z.number().nullable(),
    competitorsMentioned: z.array(z.string()),
    confidence: z.number().min(0).max(100)
  }),
  prompt: analysisPrompt
});
```

This forces AI to return exact structure, no parsing needed.

---

### Issue 5: Scheduled Execution Not Running

**Symptoms:**
- No new data appearing at scheduled times
- Have to manually execute every day

**Root Cause:**
Internal scheduler not running or business not configured properly.

**How to Check:**

**Step 1: Check Server Logs**
- Look for `[Scheduler]` messages in console output
- Should see "Starting with schedule: */5 * * * *" on startup
- Should see periodic "Running initial check..." messages

**Step 2: Check Business Configuration**
```sql
-- Check if business has next_execution_time set
SELECT id, business_name, next_execution_time, refresh_period_days
FROM businesses WHERE id = YOUR_BUSINESS_ID;
```

**Step 3: Check if Execution Time Has Passed**
- `next_execution_time` should be in the past for scheduler to trigger
- If it's in the future, wait for that time

**Common Fixes:**

**Fix A: Scheduler Not Started**
Check `instrumentation.ts` is properly configured:
```javascript
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { startScheduler } = await import('./app/lib/scheduler');
    startScheduler();
  }
}
```

**Fix B: next_execution_time Not Set**
```sql
-- Set next execution to now (will trigger on next check)
UPDATE businesses
SET next_execution_time = datetime('now')
WHERE id = YOUR_BUSINESS_ID;
```

**Fix C: Wrong CRON_SCHEDULE Format**
```bash
# WRONG
CRON_SCHEDULE="every 5 minutes"

# CORRECT
CRON_SCHEDULE="*/5 * * * *"
```

**Fix D: Server Keeps Restarting**
- Check for errors in server logs
- Scheduler only runs when server is stable
- Each restart triggers initial check after 10 seconds

---

## How to Add New Features

### Example 1: Add a New Metric (Sentiment Tracking)

Let's say you want to track whether AI responses are positive, negative, or neutral about your brand.

**Step 1: Update Database Schema**

Add column to `prompt_executions` table:
```sql
ALTER TABLE prompt_executions
ADD COLUMN sentiment TEXT CHECK(sentiment IN ('positive', 'negative', 'neutral'));
```

**What This Does:**
- Adds new field to store sentiment
- Restricts values to only these three options
- Defaults to NULL if not set

**Step 2: Update Analysis Prompt**

In `app/lib/services/ai.service.ts`, find the analysis schema:

```javascript
// ADD TO EXISTING SCHEMA:
const analysisSchema = z.object({
  // ... existing fields ...
  sentiment: z.enum(['positive', 'negative', 'neutral']).describe(
    'Overall sentiment toward the brand in this response'
  )
});
```

**What This Does:**
- Tells AI to also extract sentiment
- Uses Zod to validate response
- `.describe()` helps AI understand what you want

**Step 3: Update Analysis Prompt Text**

```javascript
const analysisPrompt = `
... existing prompt ...

Also analyze the sentiment:
- If response is favorable/recommends brand → "positive"
- If response warns against/criticizes brand → "negative"
- If response is neutral/just mentions → "neutral"
`;
```

**Step 4: Save to Database**

In `app/lib/services/prompt-execution.service.ts`, update the database write:

```javascript
dbHelpers.updateExecution.run({
  id: executionId,
  // ... existing fields ...
  sentiment: analysisResult.sentiment  // ADD THIS
});
```

**Step 5: Return to Frontend**

In `app/api/dashboard/overview/route.ts`:

```javascript
const executions = executions.map(exec => ({
  // ... existing fields ...
  sentiment: exec.sentiment  // ADD THIS
}));
```

**Step 6: Display in UI**

In `app/dashboard/overview/page.tsx`:

```javascript
// Add to interface
interface Execution {
  // ... existing fields ...
  sentiment: 'positive' | 'negative' | 'neutral';
}

// Display in table
<TableCell>
  <Badge color={getSentimentColor(execution.sentiment)}>
    {execution.sentiment}
  </Badge>
</TableCell>

// Helper function
const getSentimentColor = (sentiment) => {
  if (sentiment === 'positive') return 'green';
  if (sentiment === 'negative') return 'red';
  return 'gray';
};
```

**Step 7: Test**

1. Execute a prompt
2. Check database: `SELECT sentiment FROM prompt_executions ORDER BY id DESC LIMIT 1;`
3. Should see 'positive', 'negative', or 'neutral'
4. Check UI: Badge should appear with correct color

**Complete Flow:**
```
AI Response → Analysis with Sentiment → Database → API → Frontend → Display
```

---

### Example 2: Add New Dashboard Page (Competitor Deep-Dive)

Let's create a page that shows detailed analysis of a single competitor.

**Step 1: Create Page File**

Create `app/dashboard/competitors/page.tsx`:

```typescript
'use client';

export default function CompetitorsPage() {
  return (
    <div>
      <h1>Competitor Analysis</h1>
      {/* Will add content here */}
    </div>
  );
}
```

**What This Does:**
- Creates new route at `/dashboard/competitors`
- `'use client'` means it runs in browser (needed for React hooks)

**Step 2: Add Navigation Link**

In main layout/sidebar, add:

```typescript
<NavLink href="/dashboard/competitors">
  Competitors
</NavLink>
```

**Step 3: Create API Endpoint**

Create `app/api/dashboard/competitors/[competitorName]/route.ts`:

```typescript
export async function GET(
  request: NextRequest,
  { params }: { params: { competitorName: string } }
) {
  const competitorName = params.competitorName;
  const businessId = request.nextUrl.searchParams.get('businessId');

  // Get all executions mentioning this competitor
  const executions = dbHelpers.getExecutionsByCompetitor.all(
    businessId,
    competitorName
  );

  // Calculate metrics
  const totalMentions = executions.length;
  const averagePosition = executions.reduce((sum, e) =>
    sum + e.competitor_position, 0
  ) / totalMentions;

  return NextResponse.json({
    competitor: competitorName,
    totalMentions,
    averagePosition,
    executions
  });
}
```

**Step 4: Add Database Helper**

In `app/lib/db/database.ts`:

```typescript
export const dbHelpers = {
  // ... existing helpers ...

  getExecutionsByCompetitor: db.prepare(`
    SELECT * FROM prompt_executions
    WHERE business_id = ?
      AND competitors_mentioned LIKE '%' || ? || '%'
      AND status = 'completed'
    ORDER BY completed_at DESC
  `)
};
```

**What This Does:**
- Searches `competitors_mentioned` field for competitor name
- `LIKE '%name%'` finds name anywhere in string
- Returns all matching executions

**Step 5: Build Frontend**

Back in `app/dashboard/competitors/page.tsx`:

```typescript
'use client';

import { useState, useEffect } from 'react';

export default function CompetitorsPage() {
  const [selectedCompetitor, setSelectedCompetitor] = useState('Asana');
  const [data, setData] = useState(null);

  useEffect(() => {
    const businessId = localStorage.getItem('onboardingBusinessId');

    fetch(`/api/dashboard/competitors/${selectedCompetitor}?businessId=${businessId}`)
      .then(res => res.json())
      .then(setData);
  }, [selectedCompetitor]);

  if (!data) return <div>Loading...</div>;

  return (
    <div>
      <h1>Competitor Analysis: {data.competitor}</h1>

      <div>
        <h2>Metrics</h2>
        <p>Total Mentions: {data.totalMentions}</p>
        <p>Average Position: {data.averagePosition.toFixed(1)}</p>
      </div>

      <div>
        <h2>Responses Mentioning {data.competitor}</h2>
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Prompt</th>
              <th>Position</th>
              <th>Response</th>
            </tr>
          </thead>
          <tbody>
            {data.executions.map(exec => (
              <tr key={exec.id}>
                <td>{new Date(exec.completed_at).toLocaleDateString()}</td>
                <td>{exec.prompt_text}</td>
                <td>{exec.competitor_position}</td>
                <td>{exec.result.substring(0, 100)}...</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

**Step 6: Test**

1. Navigate to `/dashboard/competitors`
2. Should see competitor analysis
3. Check data loads correctly
4. Try selecting different competitors

**Complete Flow:**
```
Page Load → Fetch API → Query Database → Calculate Metrics → Return Data → Render UI
```

---

### Example 3: Add Bulk Delete Feature

Let's add ability to delete multiple responses at once.

**Step 1: Add Selection State**

In prompts page:

```typescript
const [selectedExecutions, setSelectedExecutions] = useState<Set<number>>(new Set());

// Toggle function
const toggleSelection = (executionId: number) => {
  setSelectedExecutions(prev => {
    const next = new Set(prev);
    if (next.has(executionId)) {
      next.delete(executionId);
    } else {
      next.add(executionId);
    }
    return next;
  });
};
```

**What This Does:**
- `Set<number>` stores selected execution IDs
- `toggleSelection` adds/removes ID on click

**Step 2: Add Checkboxes to UI**

```typescript
<Table>
  <TableRow>
    <TableHeaderCell>
      <Checkbox
        checked={selectedExecutions.size === executions.length}
        onChange={() => {
          if (selectedExecutions.size === executions.length) {
            setSelectedExecutions(new Set());  // Deselect all
          } else {
            setSelectedExecutions(new Set(executions.map(e => e.id)));  // Select all
          }
        }}
      />
    </TableHeaderCell>
    <TableHeaderCell>Date</TableHeaderCell>
    <TableHeaderCell>Response</TableHeaderCell>
  </TableRow>

  {executions.map(exec => (
    <TableRow key={exec.id}>
      <TableCell>
        <Checkbox
          checked={selectedExecutions.has(exec.id)}
          onChange={() => toggleSelection(exec.id)}
        />
      </TableCell>
      <TableCell>{exec.date}</TableCell>
      <TableCell>{exec.result}</TableCell>
    </TableRow>
  ))}
</Table>
```

**Step 3: Add Bulk Delete Button**

```typescript
const handleBulkDelete = async () => {
  if (selectedExecutions.size === 0) return;

  // Confirm
  const confirmed = window.confirm(
    `Delete ${selectedExecutions.size} responses? This cannot be undone.`
  );

  if (!confirmed) return;

  // Delete each one
  const deletePromises = Array.from(selectedExecutions).map(id =>
    fetch(`/api/prompts/executions/${id}`, { method: 'DELETE' })
  );

  await Promise.all(deletePromises);

  // Clear selection
  setSelectedExecutions(new Set());

  // Refresh data
  await fetchPromptDetails();
};

// Button
<Button
  onClick={handleBulkDelete}
  disabled={selectedExecutions.size === 0}
  color="red"
>
  Delete Selected ({selectedExecutions.size})
</Button>
```

**What This Does:**
- Shows count of selected items
- Disables if nothing selected
- Confirms before deleting
- Sends parallel DELETE requests
- Refreshes data after completion

**Step 4: Optimize API (Optional)**

Instead of individual requests, create bulk delete endpoint:

`app/api/prompts/executions/bulk-delete/route.ts`:

```typescript
export async function POST(request: NextRequest) {
  const { executionIds } = await request.json();

  // Validate
  if (!Array.isArray(executionIds) || executionIds.length === 0) {
    return NextResponse.json({ error: 'Invalid input' }, { status: 400 });
  }

  // Delete all
  const placeholders = executionIds.map(() => '?').join(',');
  const query = `DELETE FROM prompt_executions WHERE id IN (${placeholders})`;

  db.prepare(query).run(...executionIds);

  return NextResponse.json({
    success: true,
    deleted: executionIds.length
  });
}
```

Then update frontend:

```typescript
const handleBulkDelete = async () => {
  // ... confirmation ...

  await fetch('/api/prompts/executions/bulk-delete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      executionIds: Array.from(selectedExecutions)
    })
  });

  // ... refresh ...
};
```

**Why Bulk Endpoint Better?**
- Single database transaction (faster)
- Fewer network requests
- More reliable (all-or-nothing)

---

## Technical Terms Glossary

### API (Application Programming Interface)
**Simple Definition:** A way for software to talk to software.

**Analogy:** Like a waiter in a restaurant:
- You (frontend) tell waiter (API) what you want
- Waiter goes to kitchen (backend)
- Kitchen prepares food (processes data)
- Waiter brings it back (response)

**Example in Our App:**
- Frontend: "Get me analytics for last 7 days"
- API: Processes request
- Backend: Queries database, calculates metrics
- API: Returns data to frontend

---

### Frontend
**Simple Definition:** The part of the app users see and interact with.

**Includes:**
- Web pages
- Buttons
- Forms
- Charts
- Visual design

**Our Tech:** React + Next.js

**Analogy:** The storefront of a shop.

---

### Backend
**Simple Definition:** The "behind the scenes" part that processes requests.

**Includes:**
- API endpoints
- Business logic
- Database queries
- AI calls
- Calculations

**Our Tech:** Next.js API Routes

**Analogy:** The kitchen of a restaurant.

---

### Database
**Simple Definition:** Where all data is permanently stored.

**What We Store:**
- Business information
- Prompts and topics
- AI responses
- Metrics
- User settings

**Our Tech:** SQLite

**Analogy:** A filing cabinet with organized folders.

**Key Difference from Memory:**
- Memory (RAM): Temporary, lost when server restarts
- Database: Permanent, survives restarts

---

### State
**Simple Definition:** Data that can change and causes UI to update.

**Examples:**
- Is data loading? (true/false)
- List of prompts (array)
- Selected date range (string)

**In React:**
```javascript
const [isLoading, setIsLoading] = useState(false);
//     ↑           ↑                      ↑
//   current    function to          initial
//   value      change it            value
```

**Why Important:**
- When state changes, UI automatically re-renders
- Keeps UI in sync with data

---

### Props
**Simple Definition:** Data passed from parent component to child component.

**Analogy:** Like function arguments.

**Example:**
```javascript
// Parent passes data
<PromptCard prompt={promptData} onDelete={handleDelete} />

// Child receives and uses
function PromptCard({ prompt, onDelete }) {
  return (
    <div>
      <h3>{prompt.text}</h3>
      <button onClick={onDelete}>Delete</button>
    </div>
  );
}
```

---

### JSON
**Simple Definition:** A format for structuring data as text.

**Example:**
```json
{
  "name": "Acme Corp",
  "visibility": 75.5,
  "competitors": ["Asana", "Monday.com"]
}
```

**Why Use It:**
- Easy to read (for humans and computers)
- Language-independent (works everywhere)
- Native to JavaScript

**In Our App:**
- API responses are JSON
- Database stores some fields as JSON
- Frontend sends JSON in requests

---

### EventSource / Server-Sent Events (SSE)
**Simple Definition:** A connection that stays open so server can push updates to browser.

**vs. Normal Requests:**
- Normal: Browser asks → Server responds → Connection closes
- EventSource: Browser asks → Connection stays open → Server sends updates whenever ready

**Analogy:**
- Normal request = Sending a letter, waiting for response
- EventSource = Phone call that stays connected

**In Our App:**
- Used for real-time execution updates
- Browser opens connection when page loads
- Server pushes new results as they complete
- Connection stays open until page closes

---

### Concurrency
**Simple Definition:** Doing multiple things at the same time.

**In Our App:**
- Execute 5 prompts simultaneously
- As one finishes, next one starts
- Like having 5 workers instead of 1

**Why Not Do All at Once?**
- AI APIs have rate limits
- Too many requests = errors
- Computer resources limited

**Controlled Concurrency:**
- Max 5 at a time
- Rolling window (one finishes, next starts)
- Optimal balance of speed and reliability

---

### Schema
**Simple Definition:** The structure/rules for data.

**Database Schema:**
```
businesses table:
- id (number, unique)
- business_name (text, required)
- website (text, required)
- created_at (timestamp)
```

**Validation Schema (Zod):**
```javascript
z.object({
  businessName: z.string().min(1),
  website: z.string().url()
})
```

**Why Important:**
- Ensures data consistency
- Catches errors early
- Documents what's expected

---

### Middleware
**Simple Definition:** Code that runs before your main code.

**Common Uses:**
- Authentication (check if user logged in)
- Logging (record requests)
- Error handling (catch problems)

**Analogy:** Security guard at building entrance.

**In Our App:**
- Not heavily used (simple app)
- Could add: Rate limiting, auth checks, etc.

---

### Environment Variables
**Simple Definition:** Secret configuration stored outside code.

**Examples:**
- `NEXTAUTH_SECRET` = Session encryption key
- `NEXTAUTH_URL` = Your app's public URL
- `CRON_SCHEDULE` = Internal scheduler frequency

**Why Not in Code?**
- Security (don't expose secrets)
- Flexibility (different per environment)
- Easy to change without code changes

**In Our App:**
- Stored in `.env.local` for development
- Set as environment variables for production
- Accessed via `process.env.VARIABLE_NAME`

---

### TypeScript
**Simple Definition:** JavaScript with type checking.

**Example:**
```typescript
// JavaScript (any value allowed)
let age = 25;
age = "twenty-five";  // No error

// TypeScript (enforces types)
let age: number = 25;
age = "twenty-five";  // ERROR: Type 'string' not assignable to 'number'
```

**Benefits:**
- Catches bugs early
- Better autocomplete
- Self-documenting code

**In Our App:**
- Used throughout (files end in .ts/.tsx)
- Interfaces define data structures
- Helps prevent errors

---

### Idempotent
**Simple Definition:** Running multiple times has same effect as running once.

**Example:**
```
Non-idempotent:
- Click "add" 3 times → 3 items added

Idempotent:
- Click "set to X" 3 times → value is X (not XXX)
```

**In Our App:**
- Onboarding steps delete existing data before inserting
- Safe to re-run without duplicates
- Going back in onboarding won't break things

---

### Webhook
**Simple Definition:** A way for one system to notify another when something happens.

**Analogy:** Like a doorbell - rings when someone's there.

**Example Flow:**
1. You tell service: "When X happens, call my URL"
2. X happens
3. Service sends HTTP request to your URL
4. Your code handles it

**In Our App:**
- Not currently used
- Could add: AI platform webhooks, payment webhooks, etc.

---

## Summary

You now understand:

1. **Big Picture:** Three-part architecture (Frontend, Backend, Database)

2. **Data Flow:** Two patterns (simple request-response, background processing)

3. **User Journey:** Step-by-step through onboarding and execution

4. **Core Systems:**
   - Job queue with concurrency control
   - Real-time updates via EventSource
   - Analytics aggregation
   - Internal scheduler (node-cron) for automated execution

5. **Troubleshooting:** How to diagnose and fix common issues

6. **Extension:** How to add new features (metrics, pages, bulk operations)

7. **Terms:** Plain-language explanations of technical concepts

With this knowledge, you can:
- ✅ Understand how any part of the system works
- ✅ Troubleshoot issues when they arise
- ✅ Add new features following existing patterns
- ✅ Communicate with developers effectively
- ✅ Make informed decisions about the architecture

Next steps:
- Read the code with this guide as reference
- Try adding a simple feature
- Use troubleshooting section when issues arise
- Refer to glossary when you see unfamiliar terms
