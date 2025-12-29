# Prompt Clarity Developer Guide: Backend Architecture

## 📋 Table of Contents
1. [Core Backend Flow](#core-backend-flow)
2. [Database Architecture](#database-architecture)
3. [Prompt Execution Engine](#prompt-execution-engine)
4. [AI Integration Layer](#ai-integration-layer)
5. [Real-Time Communication](#real-time-communication)
6. [Concurrency & Performance](#concurrency--performance)
7. [State Management](#state-management)
8. [Error Handling](#error-handling)
9. [Code Walkthrough](#code-walkthrough)

> **Note**: This guide provides architectural patterns and examples. Line numbers may vary as the codebase evolves.

---

## Core Backend Flow

### The Execution Pipeline

When a user clicks "Execute All", here's what happens in the code:

```typescript
// 1. FRONTEND: User clicks button
// File: app/dashboard/prompts/page.tsx
const executeAllPrompts = async () => {
  const businessId = localStorage.getItem('onboardingBusinessId');

  // POST request to API
  await fetch('/api/prompts/executions', {
    method: 'POST',
    body: JSON.stringify({ businessId: parseInt(businessId) })
  });
};

// 2. API ROUTE: Receives request
// File: app/api/prompts/executions/route.ts
export async function POST(request: NextRequest) {
  const { businessId, promptId } = await request.json();

  if (!promptId) {
    // Execute ALL prompts - this is key!
    // We DON'T await - let it run in background
    promptExecutionService.executeAllPrompts(businessId).catch(error => {
      console.error('Error executing all prompts:', error);
    });

    // Return immediately (fixes timeout issue)
    return NextResponse.json({
      success: true,
      message: 'Started execution for all prompts'
    });
  }
}

// 3. EXECUTION SERVICE: Main orchestrator
// File: app/lib/services/prompt-execution.service.ts
async executeAllPrompts(businessId: number): Promise<void> {
  console.log(`[PromptExecution] Starting execution for business ${businessId}`);

  // Get all prompts from database
  const prompts = this.getPromptsByBusiness(businessId);

  // Get all active platforms (with API keys)
  const platforms = this.getActivePlatforms(businessId);

  // Create job queue: every prompt × every platform
  const jobs: ExecutionJob[] = [];
  for (const prompt of prompts) {
    for (const platform of platforms) {
      jobs.push({ businessId, prompt, platform });
    }
  }

  console.log(`[PromptExecution] Created ${jobs.length} jobs to execute`);

  // Execute with concurrency control (max 5 parallel)
  await this.executeJobs(jobs);

  console.log(`[PromptExecution] Completed all executions`);
}
```

### The Job Queue & Concurrency

The system uses a **rolling window** of concurrent executions:

```typescript
// File: app/lib/services/prompt-execution.service.ts
private async executeJobs(jobs: ExecutionJob[]): Promise<void> {
  const maxConcurrent = 5; // Never more than 5 at once
  const runningJobs = new Set<Promise<ExecutionResult>>();

  for (const job of jobs) {
    // Start the job (returns Promise immediately)
    const jobPromise = this.executeJob(job);
    runningJobs.add(jobPromise);

    // When job completes, remove from running set
    jobPromise.finally(() => {
      runningJobs.delete(jobPromise);
    });

    // If we hit max concurrent, wait for one to finish
    if (runningJobs.size >= maxConcurrent) {
      // Race: returns when ANY job completes
      await Promise.race(runningJobs);
    }
  }

  // Wait for all remaining jobs to finish
  await Promise.allSettled(runningJobs);
}
```

**Why this pattern?**
- Prevents overwhelming AI APIs with 100+ simultaneous requests
- Allows progress to be seen (jobs complete gradually)
- Handles failures gracefully (one failure doesn't stop others)
- Optimizes throughput vs resource usage

---

## Database Architecture

### Schema Deep Dive

```typescript
// File: app/lib/db/database.ts

// The CORE table - stores everything about an execution
CREATE TABLE prompt_executions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,

  -- Relationships
  business_id INTEGER NOT NULL,
  prompt_id INTEGER NOT NULL,
  platform_id INTEGER NOT NULL,  // Foreign key to business_platforms

  -- Execution state
  status TEXT CHECK(status IN ('pending', 'running', 'completed', 'failed')),
  started_at DATETIME,
  completed_at DATETIME,
  refresh_date DATETIME,  // The "day" this execution represents

  -- AI Response
  result TEXT,  // Raw AI output
  error_message TEXT,

  -- Analysis Results (extracted from AI response)
  brand_mentions INTEGER DEFAULT 0,
  competitors_mentioned TEXT,  // JSON array: ["Asana", "Monday.com"]
  mention_analysis TEXT,  // Full JSON: {rankings: [...], sentiment: "positive"}
  analysis_confidence REAL,  // 0.0 to 1.0

  -- Calculated Metrics
  business_visibility REAL,  // 0 or 1 (binary: mentioned or not)
  share_of_voice REAL,  // Percentage: 33.3
  competitor_share_of_voice TEXT,  // JSON: {"Asana": 33.3, "Monday.com": 33.3}
  competitor_visibilities TEXT,  // JSON: {"Asana": 1, "Monday.com": 0}

  -- Foreign keys
  FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE,
  FOREIGN KEY (prompt_id) REFERENCES prompts(id) ON DELETE CASCADE,
  FOREIGN KEY (platform_id) REFERENCES business_platforms(id) ON DELETE CASCADE
);
```

### Prepared Statements (Better-SQLite3)

All queries use prepared statements for performance:

```typescript
// File: app/lib/db/database.ts
export const dbHelpers = {
  // Prepared once, reused many times
  getPromptsByBusiness: db.prepare(`
    SELECT * FROM prompts WHERE business_id = ?
  `),

  createPromptExecution: db.prepare(`
    INSERT INTO prompt_executions (
      business_id, prompt_id, platform_id,
      status, started_at, refresh_date
    ) VALUES (?, ?, ?, ?, ?, ?)
  `),


  updatePromptExecution: db.prepare(`
    UPDATE prompt_executions
    SET status = ?,
        result = ?,

        completed_at = ?,
        brand_mentions = ?,
        competitors_mentioned = ?,
        mention_analysis = ?,
        analysis_confidence = ?,
        business_visibility = ?,
        share_of_voice = ?,
        competitor_share_of_voice = ?
    WHERE id = ?
  `)
};

// Usage:
const prompts = dbHelpers.getPromptsByBusiness.all(businessId);
```

**Why prepared statements?**
- **Faster**: Compiled once, executed many times
- **Safer**: Prevents SQL injection
- **Type-safe**: Better-SQLite3 validates parameters

### The refresh_date Field

This is critical for time-series data:

```typescript
// When creating an execution
const today = new Date();
today.setHours(0, 0, 0, 0);  // Midnight UTC
const refreshDate = today.toISOString();  // "2024-11-20T00:00:00.000Z"

// All executions on the same day share this date
// Allows grouping by day for charts
```

**Query example:**
```sql
-- Get all executions for a specific day
SELECT * FROM prompt_executions
WHERE refresh_date = '2024-11-20T00:00:00.000Z'

-- Group by day for time-series
SELECT
  DATE(refresh_date) as day,
  AVG(business_visibility) as avg_visibility
FROM prompt_executions
GROUP BY DATE(refresh_date)
ORDER BY day
```

---

## Prompt Execution Engine

### Single Job Execution (The Critical Path)

This is where the magic happens:

```typescript
// File: app/lib/services/prompt-execution.service.ts
private async executeJob(job: ExecutionJob): Promise<ExecutionResult> {
  const { businessId, prompt, platform } = job;

  // ===== STEP 1: CREATE DATABASE RECORD =====
  const executionId = this.createExecutionRecord(
    businessId,
    prompt.id,
    platform.id
  );
  // Database now has: { id: 123, status: 'pending', started_at: now() }

  try {
    // ===== STEP 2: VALIDATE PROMPT STILL EXISTS =====
    // (Could be deleted during execution)
    const promptExists = this.validatePromptExists(businessId, prompt.id);
    if (!promptExists) {
      this.updateExecutionStatus(executionId, 'failed', null, 'Prompt deleted');
      return { promptId: prompt.id, modelId: platform.id, success: false };
    }

    // ===== STEP 3: UPDATE STATUS TO 'RUNNING' =====
    this.updateExecutionStatus(executionId, 'running');

    // ===== STEP 4: CALL THE AI PLATFORM =====
    const result = await this.callAIPlatform(prompt.text, platform);
    // result = "Top project management tools include: 1) Asana..."

    // ===== STEP 5: ANALYZE THE RESPONSE WITH AI =====
    const mentionData = await this.analyzeMentions(businessId, result);
    /* mentionData = {
      brandMentions: 1,
      competitorsMentioned: ["Asana", "Monday.com"],
      analysisDetails: {
        brandMentioned: true,
        brandPosition: 2,
        rankings: [...]
      },
      confidence: 0.95
    } */

    // Check if analysis failed
    if (mentionData.analysisDetails?.error) {
      this.updateExecutionStatus(executionId, 'failed', result, 'Analysis failed');
      return { promptId: prompt.id, modelId: platform.id, success: false };
    }

    // ===== STEP 6: CALCULATE VISIBILITY =====
    const visibilityData = this.calculateVisibility(businessId, mentionData);
    /* visibilityData = {
      businessVisibility: 1,  // Mentioned
      competitorVisibilities: { "Asana": 1, "Monday.com": 1 }
    } */

    // ===== STEP 7: CALCULATE SHARE OF VOICE =====
    const shareOfVoiceData = this.calculateShareOfVoice(businessId, mentionData);
    /* shareOfVoiceData = {
      businessShareOfVoice: 33.3,
      competitorShareOfVoice: { "Asana": 33.3, "Monday.com": 33.3 }
    } */

    // ===== STEP 8: UPDATE DATABASE WITH ALL DATA =====
    this.updateExecutionStatus(executionId, 'completed', result, null, {
      ...mentionData,
      ...visibilityData,
      shareOfVoice: shareOfVoiceData.businessShareOfVoice,
      competitorShareOfVoice: shareOfVoiceData.competitorShareOfVoice
    });

    // ===== STEP 9: SEND REAL-TIME UPDATE TO BROWSER =====
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const refreshDate = today.toISOString().split('T')[0];

    this.sendRealtimeUpdate(businessId, {
      status: 'completed',
      promptId: prompt.id,
      platformId: platform.id,
      result,
      completedAt: new Date().toISOString(),
      refreshDate: refreshDate,
      brandMentions: mentionData.brandMentions,
      competitorsMentioned: mentionData.competitorsMentioned,
      analysisConfidence: mentionData.confidence,
      businessVisibility: visibilityData.businessVisibility,
      shareOfVoice: shareOfVoiceData.businessShareOfVoice,
      competitorShareOfVoice: shareOfVoiceData.competitorShareOfVoice,
      executionCount: this.getExecutionCount(businessId, prompt.id, platform.id)
    });

    console.log(`✅ Successfully executed prompt ${prompt.id} with ${platform.id}`);

    return {
      promptId: prompt.id,
      modelId: platform.id,
      success: true
    };

  } catch (error: any) {
    // ===== ERROR HANDLING =====
    console.error(`❌ Error executing prompt ${prompt.id}:`, error);
    this.updateExecutionStatus(executionId, 'failed', null, error.message);

    return {
      promptId: prompt.id,
      modelId: platform.id,
      success: false,
      error: error.message
    };
  }
}
```

### Database Record Lifecycle

```
1. CREATE (pending)
   INSERT INTO prompt_executions
   status = 'pending'
   started_at = '2024-11-20T14:30:00Z'

2. UPDATE (running)
   UPDATE prompt_executions
   status = 'running'
   WHERE id = 123

3. UPDATE (completed)
   UPDATE prompt_executions
   status = 'completed'
   result = 'Top VPN solutions...'
   completed_at = '2024-11-20T14:30:15Z'
   brand_mentions = 1
   business_visibility = 1
   share_of_voice = 33.3
   (... all other fields)
   WHERE id = 123
```

---

## AI Integration Layer

### Calling AI Platforms

```typescript
// File: app/lib/services/prompt-execution.service.ts
private async callAIPlatform(
  promptText: string,
  platform: Platform
): Promise<string> {

  // Get the AI model based on provider using Vercel AI SDK
  let model;

  switch (platform.provider) {
    case 'openai':
      model = openai('gpt-4o');
      break;
    case 'anthropic':
      model = anthropic('claude-sonnet-4-20250514');
      break;
    case 'google':
      model = google('gemini-2.0-flash-exp');
      break;
    case 'perplexity':
      model = perplexity('llama-3.1-sonar-large-128k-online');
      break;
    case 'xai':
      model = xai('grok-2-latest');
      break;
  }

  // Use Vercel AI SDK to call the model
  const { text } = await generateText({
    model: model,
    apiKey: platform.apiKey,  // User's API key from database
    messages: [
      {
        role: 'user',
        content: promptText
      }
    ],
    temperature: 0.7,
    maxTokens: 1000
  });

  return text;
}
```

**Key points:**
- Uses **Vercel AI SDK** for unified interface across providers
- Each platform has its own API key (stored per-business)
- Returns raw text response for analysis

### Analyzing AI Responses (The Smart Part)

This is where we use AI to analyze AI responses:

```typescript
// File: app/lib/services/prompt-execution.service.ts
private async analyzeMentions(
  businessId: number,
  aiResponse: string
): Promise<MentionAnalysis> {

  // Get business info and competitors
  const business = dbHelpers.getBusiness.get(businessId);
  const competitors = dbHelpers.getCompetitorsByBusiness.all(businessId);

  // Build list of all companies to look for
  const allCompanies = [
    business.business_name,
    ...competitors.map(c => c.name)
  ];

  // Load analysis prompt template from YAML
  const analysisPrompt = promptTemplates['mention-analysis'];

  // Replace variables in template
  const systemPrompt = analysisPrompt.systemPrompt
    .replace('{{brandName}}', business.business_name)
    .replace('{{competitors}}', allCompanies.join(', '))
    .replace('{{response}}', aiResponse);

  // Get primary AI platform for analysis
  const primaryPlatform = this.getPrimaryPlatform(businessId);
  const model = this.getAIModel(primaryPlatform);

  // ===== STRUCTURED OUTPUT SCHEMA =====
  // This ensures AI returns JSON in exact format we need
  const RankingSchema = z.object({
    position: z.number().describe('Ranking position (1, 2, 3, etc.)'),
    company: z.string().describe('Company name'),
    sentiment: z.enum(['positive', 'neutral', 'negative']).describe('Sentiment')
  });

  const ResponseAnalysisSchema = z.object({
    brandMentioned: z.boolean().describe('Was the brand mentioned?'),
    brandPosition: z.number().optional().describe('Position if mentioned'),
    rankings: z.array(RankingSchema).describe('All companies mentioned with rankings'),
    overallSentiment: z.enum(['positive', 'neutral', 'negative']).optional(),
    confidence: z.number().min(0).max(1).describe('Confidence score 0-1')
  });

  try {
    // ===== CALL AI WITH STRUCTURED OUTPUT =====
    const { object } = await generateObject({
      model: model,
      apiKey: primaryPlatform.apiKey,
      schema: ResponseAnalysisSchema,
      prompt: systemPrompt,
      temperature: 0.3,  // Lower = more consistent
      maxTokens: 1000
    });

    /* object = {
      brandMentioned: true,
      brandPosition: 2,
      rankings: [
        { position: 1, company: "Asana", sentiment: "positive" },
        { position: 2, company: "Acme", sentiment: "positive" },
        { position: 3, company: "Monday.com", sentiment: "neutral" }
      ],
      overallSentiment: "positive",
      confidence: 0.95
    } */

    // Extract data from structured response
    const brandMentions = object.brandMentioned ? 1 : 0;

    const competitorsMentioned = object.rankings
      .map(r => r.company)
      .filter(name => name !== business.business_name);

    return {
      brandMentions,
      competitorsMentioned,
      analysisDetails: object,
      confidence: object.confidence
    };

  } catch (error) {
    console.error('Error analyzing mentions:', error);

    // Fallback: return safe defaults
    return {
      brandMentions: 0,
      competitorsMentioned: [],
      analysisDetails: { error: 'Analysis failed' },
      confidence: 0
    };
  }
}
```

**Why structured output?**

Instead of this (error-prone):
```typescript
const response = "Acme is ranked #2 with positive sentiment";
const position = parseInt(response.match(/#(\d+)/)[1]);  // Fragile!
```

We get this (reliable):
```typescript
const { object } = await generateObject({
  schema: z.object({
    position: z.number(),
    sentiment: z.enum(['positive', 'neutral', 'negative'])
  })
});
// object = { position: 2, sentiment: "positive" }
```

### Calculating Metrics

```typescript
// File: app/lib/services/prompt-execution.service.ts
private calculateVisibility(
  businessId: number,
  mentionData: MentionAnalysis
): VisibilityData {

  // Binary: mentioned or not
  const businessVisibility = mentionData.brandMentions > 0 ? 1 : 0;

  // For each competitor
  const competitors = dbHelpers.getCompetitorsByBusiness.all(businessId);
  const competitorVisibilities: Record<string, number> = {};

  competitors.forEach(competitor => {
    const mentioned = mentionData.competitorsMentioned.includes(competitor.name);
    competitorVisibilities[competitor.name] = mentioned ? 1 : 0;
  });

  return {
    businessVisibility,
    competitorVisibilities
  };
}

// File: app/lib/services/prompt-execution.service.ts
private calculateShareOfVoice(
  businessId: number,
  mentionData: MentionAnalysis
): ShareOfVoiceData {

  const totalMentions = mentionData.brandMentions +
                        mentionData.competitorsMentioned.length;

  // Avoid division by zero
  if (totalMentions === 0) {
    return {
      businessShareOfVoice: 0,
      competitorShareOfVoice: {}
    };
  }

  // Calculate as percentage
  const businessShareOfVoice = (mentionData.brandMentions / totalMentions) * 100;

  // For each competitor
  const competitors = dbHelpers.getCompetitorsByBusiness.all(businessId);
  const competitorShareOfVoice: Record<string, number> = {};

  competitors.forEach(competitor => {
    const mentioned = mentionData.competitorsMentioned.includes(competitor.name);
    competitorShareOfVoice[competitor.name] = mentioned
      ? (1 / totalMentions) * 100
      : 0;
  });

  return {
    businessShareOfVoice,
    competitorShareOfVoice
  };
}
```

---

## Real-Time Communication

### Server-Sent Events (EventSource)

This is how the UI updates without polling:

```typescript
// ===== FRONTEND: Establish connection =====
// File: app/dashboard/prompts/page.tsx
const setupEventStream = (businessId: string) => {
  const eventSource = new EventSource(
    `/api/prompts/executions/stream?businessId=${businessId}`
  );

  eventSource.onmessage = (event) => {
    const data = JSON.parse(event.data);

    if (data.status === 'started') {
      // Add to executing set
      setExecutingPrompts(prev => new Set(prev).add(data.promptId));
    }

    if (data.status === 'completed') {
      // Remove from executing
      setExecutingPrompts(prev => {
        const next = new Set(prev);
        next.delete(data.promptId);
        return next;
      });

      // Update UI with new data
      updateSinglePromptResponse(data);
    }
  };

  eventSource.onerror = (error) => {
    console.error('EventSource error:', error);
    eventSource.close();

    // Reconnect after 5 seconds
    setTimeout(() => setupEventStream(businessId), 5000);
  };

  return eventSource;
};
```

```typescript
// ===== BACKEND: Stream endpoint =====
// File: app/api/prompts/executions/stream/route.ts
export async function GET(request: NextRequest) {
  const businessId = parseInt(request.nextUrl.searchParams.get('businessId') || '0');

  // Create streaming response
  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();

      // Send heartbeat every 30 seconds (keeps connection alive)
      const heartbeat = setInterval(() => {
        controller.enqueue(encoder.encode(': heartbeat\n\n'));
      }, 30000);

      // Register this connection for updates
      const connectionId = connectionManager.addConnection(
        parseInt(businessId),
        (data) => {
          // When update received, send to client
          const message = `data: ${JSON.stringify(data)}\n\n`;
          controller.enqueue(encoder.encode(message));
        }
      );

      // Cleanup on close
      request.signal.addEventListener('abort', () => {
        clearInterval(heartbeat);
        connectionManager.removeConnection(parseInt(businessId), connectionId);
        controller.close();
      });
    }
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive'
    }
  });
}
```

```typescript
// ===== CONNECTION MANAGER: Singleton =====
// File: app/lib/services/prompt-execution.service.ts
class ConnectionManager {
  // Map: businessId → Set of callback functions
  private connections = new Map<number, Set<(data: any) => void>>();

  addConnection(businessId: number, callback: (data: any) => void): string {
    if (!this.connections.has(businessId)) {
      this.connections.set(businessId, new Set());
    }

    this.connections.get(businessId)!.add(callback);
    const connectionId = Math.random().toString(36);

    console.log(`[ConnectionManager] Added connection for business ${businessId}`);
    return connectionId;
  }

  sendUpdate(businessId: number, data: any): void {
    const callbacks = this.connections.get(businessId);
    if (callbacks) {
      callbacks.forEach(callback => callback(data));
    }
  }

  removeConnection(businessId: number, callback: (data: any) => void): void {
    const callbacks = this.connections.get(businessId);
    if (callbacks) {
      callbacks.delete(callback);
    }
  }
}

// Global singleton
const connectionManager = new ConnectionManager();
```

**The Flow:**
```
1. Browser opens EventSource connection
2. Backend registers callback in ConnectionManager
3. When execution completes:
   └─ promptExecutionService.sendRealtimeUpdate(businessId, data)
      └─ connectionManager.sendUpdate(businessId, data)
         └─ Calls all registered callbacks
            └─ Each callback sends data through its stream
               └─ Browser receives 'message' event
                  └─ React updates UI
```

---

## Concurrency & Performance

### Why Max 5 Concurrent?

```typescript
const maxConcurrent = 5;
```

**Trade-offs:**

| Concurrent | Pros | Cons |
|------------|------|------|
| 1 | Safe, simple | Very slow (100 prompts = 100+ min) |
| 5 | Balanced | Good throughput |
| 20 | Fast | Rate limits, memory issues |
| 100 | Fastest | Crashes, bans |

**Our choice:** 5 concurrent executions
- Respects API rate limits
- ~15 prompts/min throughput
- Low memory footprint
- Handles errors gracefully

### Promise.race() Pattern

```typescript
// Wait for ANY job to complete
await Promise.race(runningJobs);

// vs

// Wait for ALL jobs to complete
await Promise.all(runningJobs);
```

**Promise.race()** returns when the FIRST promise settles:
```typescript
const jobs = [
  executeJob(job1),  // Takes 3s
  executeJob(job2),  // Takes 5s
  executeJob(job3),  // Takes 2s ← Finishes first
  executeJob(job4),  // Takes 4s
  executeJob(job5)   // Takes 6s
];

// After 2s, Promise.race returns
// Now we can start job6
```

This creates a **rolling window** of executions.

### Promise.allSettled() vs Promise.all()

```typescript
// At the end:
await Promise.allSettled(runningJobs);

// vs

await Promise.all(runningJobs);
```

**Promise.allSettled()**: Waits for all, never rejects
```typescript
const results = await Promise.allSettled([
  Promise.resolve('success'),
  Promise.reject('error'),
  Promise.resolve('success')
]);

// results = [
//   { status: 'fulfilled', value: 'success' },
//   { status: 'rejected', reason: 'error' },
//   { status: 'fulfilled', value: 'success' }
// ]
```

**Promise.all()**: Rejects if ANY fails
```typescript
try {
  await Promise.all([
    Promise.resolve('success'),
    Promise.reject('error'),  // ← Causes rejection
    Promise.resolve('success')
  ]);
} catch (error) {
  // Stops here, remaining promises abandoned
}
```

**Why allSettled?** One failed execution shouldn't stop others.

---

## State Management

### Database as Source of Truth

```typescript
// BAD: State in memory
let executionResults = [];  // Lost on server restart

// GOOD: State in database
db.prepare(`
  INSERT INTO prompt_executions ...
`).run(executionData);
```

**Benefits:**
- Survives server restarts
- Multiple instances can share data
- Historical data preserved
- Easy to query and aggregate

### React State Synchronization

```typescript
// File: app/dashboard/prompts/page.tsx
const [topics, setTopics] = useState<Topic[]>([]);
const [executingPrompts, setExecutingPrompts] = useState<Set<number>>(new Set());

// Update when EventSource receives data
const updateSinglePromptResponse = (data: any) => {
  setTopics(prevTopics => {
    return prevTopics.map(topic => ({
      ...topic,
      prompts: topic.prompts.map(prompt => {
        if (prompt.id === data.promptId) {
          // Update this specific prompt
          return {
            ...prompt,
            responses: [
              ...prompt.responses.filter(r =>
                r.platformId !== data.platformId ||
                r.refreshDate !== data.refreshDate
              ),
              {
                executionId: data.executionId,
                platformId: data.platformId,
                result: data.result,
                completedAt: data.completedAt,
                // ... all other fields
              }
            ]
          };
        }
        return prompt;
      })
    }));
  });
};
```

**Key principle:** Immutable updates
- Never mutate state directly
- Always create new objects/arrays
- React can detect changes efficiently

---

## Error Handling

### Graceful Degradation

```typescript
try {
  const result = await this.callAIPlatform(prompt.text, platform);
  const mentionData = await this.analyzeMentions(businessId, result);

  if (mentionData.analysisDetails?.error) {
    // Analysis failed, but we have the raw result
    this.updateExecutionStatus(executionId, 'failed', result, 'Analysis failed');
    return { success: false, error: 'Analysis failed' };
  }

  // Success path...

} catch (error: any) {
  // API call failed completely
  console.error('Error executing job:', error);
  this.updateExecutionStatus(executionId, 'failed', null, error.message);

  // Don't throw - let other jobs continue
  return { success: false, error: error.message };
}
```

**Levels of failure:**
1. **API call fails** → Mark as failed, continue with other jobs
2. **Analysis fails** → Save raw response, mark as failed
3. **Database error** → Throw (can't continue without DB)

### Retry Strategy

```typescript
// For transient failures (network issues)
async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries = 3
): Promise<T> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      if (i === maxRetries - 1) throw error;

      const delay = Math.pow(2, i) * 1000;  // 1s, 2s, 4s
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  throw new Error('Max retries exceeded');
}

// Usage:
const result = await retryWithBackoff(() =>
  this.callAIPlatform(prompt.text, platform)
);
```

---

## Code Walkthrough

### Following a Single Execution

Let me trace EXACTLY what happens when you execute one prompt:

```
USER: Clicks "Execute All" button

BROWSER (page.tsx:508)
  └─ executeAllPrompts()
     └─ fetch('/api/prompts/executions', {
          method: 'POST',
          body: { businessId: 1 }
        })

SERVER (route.ts:5)
  └─ POST(request)
     └─ promptExecutionService.executeAllPrompts(1)
        (runs in background, doesn't await)
     └─ Returns { success: true } immediately

BACKGROUND PROCESS (prompt-execution.service.ts:75)
  └─ executeAllPrompts(1)
     ├─ getPromptsByBusiness(1)
     │  └─ Database: SELECT * FROM prompts WHERE business_id = 1
     │     Returns: [
     │       { id: 1, text: "What are the best project management tools?" },
     │       { id: 2, text: "Compare Acme vs Asana" }
     │     ]
     │
     ├─ getActivePlatforms(1)
     │  └─ Database: SELECT * FROM business_platforms WHERE business_id = 1 AND is_active = 1
     │     Returns: [
     │       { id: 1, platform_id: 'chatgpt', api_key: 'sk-...' },
     │       { id: 2, platform_id: 'claude', api_key: 'sk-ant-...' }
     │     ]
     │
     ├─ Create jobs: 2 prompts × 2 platforms = 4 jobs
     │  jobs = [
     │    { prompt: 1, platform: 'chatgpt' },
     │    { prompt: 1, platform: 'claude' },
     │    { prompt: 2, platform: 'chatgpt' },
     │    { prompt: 2, platform: 'claude' }
     │  ]
     │
     └─ executeJobs(jobs)
        └─ FOR EACH JOB (max 5 concurrent):
           └─ executeJob(job)
              │
              ├─ createExecutionRecord()
              │  └─ Database: INSERT INTO prompt_executions
              │                (business_id, prompt_id, platform_id, status, started_at)
              │                VALUES (1, 1, 1, 'pending', '2024-11-20T14:30:00Z')
              │     Returns: executionId = 123
              │
              ├─ updateExecutionStatus(123, 'running')
              │  └─ Database: UPDATE prompt_executions SET status = 'running' WHERE id = 123
              │
              ├─ callAIPlatform("What are the best project management tools?", chatgpt)
              │  └─ generateText({
              │       model: openai('gpt-4o'),
              │       apiKey: 'sk-...',
              │       messages: [{ role: 'user', content: "What are..." }]
              │     })
              │     Returns: "Top project management tools include: 1) Asana for enterprise,
              │               2) Acme for small businesses, 3) Monday.com for flexibility..."
              │
              ├─ analyzeMentions(1, result)
              │  ├─ Load prompt template from mention-analysis.yaml
              │  ├─ Replace {{brandName}} with "Acme"
              │  ├─ Replace {{competitors}} with "Asana, Monday.com, ClickUp"
              │  ├─ Replace {{response}} with AI output
              │  │
              │  └─ generateObject({
              │       model: openai('gpt-4-turbo'),
              │       schema: ResponseAnalysisSchema,
              │       prompt: "Analyze this AI response..."
              │     })
              │     Returns: {
              │       brandMentioned: true,
              │       brandPosition: 2,
              │       rankings: [
              │         { position: 1, company: "Asana", sentiment: "positive" },
              │         { position: 2, company: "Acme", sentiment: "positive" },
              │         { position: 3, company: "Monday.com", sentiment: "neutral" }
              │       ],
              │       confidence: 0.95
              │     }
              │
              ├─ calculateVisibility(1, mentionData)
              │  Returns: {
              │    businessVisibility: 1,
              │    competitorVisibilities: { "Asana": 1, "Monday.com": 1 }
              │  }
              │
              ├─ calculateShareOfVoice(1, mentionData)
              │  Returns: {
              │    businessShareOfVoice: 33.3,
              │    competitorShareOfVoice: { "Asana": 33.3, "Monday.com": 33.3 }
              │  }
              │
              ├─ updateExecutionStatus(123, 'completed', result, null, allMetrics)
              │  └─ Database: UPDATE prompt_executions SET
              │                status = 'completed',
              │                result = 'Top project management tools...',
              │                completed_at = '2025-01-15T14:30:15Z',
              │                brand_mentions = 1,
              │                competitors_mentioned = '["Asana","Monday.com"]',
              │                mention_analysis = '{...}',
              │                analysis_confidence = 0.95,
              │                business_visibility = 1,
              │                share_of_voice = 33.3,
              │                competitor_share_of_voice = '{"Asana":33.3,...}',
              │                competitor_visibilities = '{"Asana":1,...}'
              │                WHERE id = 123
              │
              └─ sendRealtimeUpdate(1, updateData)
                 └─ connectionManager.sendUpdate(1, {
                      status: 'completed',
                      promptId: 1,
                      platformId: 1,
                      result: 'Top VPN solutions...',
                      completedAt: '2024-11-20T14:30:15Z',
                      refreshDate: '2024-11-20',
                      brandMentions: 1,
                      // ... all other fields
                    })
                    │
                    └─ FOR EACH connected browser:
                       └─ callback(updateData)
                          └─ Send through EventSource stream
                             └─ Browser receives message

BROWSER (EventSource handler)
  └─ eventSource.onmessage(event)
     └─ data = JSON.parse(event.data)
     └─ updateSinglePromptResponse(data)
        └─ setTopics(prevTopics => { ... })
           └─ React re-renders with new data

UI UPDATES
  ├─ Blue banner: "Executing 3 prompts" → "Executing 2 prompts"
  ├─ History table: New row appears with AI response
  ├─ Chart: New data point added
  └─ Metrics: Visibility % recalculated
```

---

## Summary: Key Takeaways

### Architecture Patterns

1. **Background Processing**: Long tasks run async, API returns immediately
2. **Event-Driven Updates**: Server-Sent Events for real-time UI updates
3. **Concurrency Control**: Max 5 parallel with Promise.race rolling window
4. **Structured Output**: AI returns JSON schemas for reliable parsing
5. **Database as Truth**: All state persisted, not in-memory
6. **Graceful Degradation**: Individual failures don't stop the system

### Critical Code Paths

1. **Execution Pipeline**: API → Service → Jobs → AI → Analysis → DB → SSE → UI
2. **AI Analysis**: Raw response → Structured extraction → Metric calculation
3. **Real-time Flow**: ConnectionManager → EventSource → React state

### Performance Considerations

- **Prepared statements** for faster DB queries
- **Streaming responses** for real-time updates
- **Concurrency limits** to prevent overload
- **Background execution** to avoid timeouts

### Developer Workflow

To add a new feature:
1. Add database schema if needed
2. Create prepared statements in `dbHelpers`
3. Add service method in `prompt-execution.service.ts`
4. Create API route in `app/api/...`
5. Add UI in `app/dashboard/...`
6. Test real-time updates via EventSource

The system is built for **reliability, scalability, and real-time responsiveness** while handling AI operations that can be slow and unpredictable.
