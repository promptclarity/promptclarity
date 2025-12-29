# Growth Features Overview

This document explains the three features under the **Growth** section of the dashboard sidebar.

## Quick Comparison

| Feature | Scope | Data Source | Primary Use Case |
|---------|-------|-------------|------------------|
| **Actions** | On-page + Off-page | AI-generated (LLM) | Detailed, actionable recommendations |
| **Content Roadmap** | On-page only | Database analysis | Identify content gaps on your website |
| **Off-Page & PR** | Off-page only | Database analysis | Distribution & outreach strategy |

---

## Actions (`/dashboard/growth`)

The Actions page provides **AI-powered recommendations** for improving your visibility in AI responses.

### How It Works
- Uses an LLM to analyze your prompt execution data
- Generates specific, personalized recommendations
- Provides detailed action steps for each recommendation

### Features
- **Two main tabs**: Off-Page Recommendations and On-Page Recommendations
- **Off-page sub-categories**: Editorial, UGC (User Generated Content), Reference
- **Date range filtering**: 7 days, 14 days, 30 days, or custom range
- **Detail panel**: Click any recommendation to see full details

### What You Get
Each recommendation includes:
- Priority level (high/medium/low)
- Specific action steps to follow
- Content suggestions with descriptions
- Reasoning with supporting data points
- Competitor presence analysis
- Estimated impact

---

## Content Roadmap (`/dashboard/content-roadmap`)

The Content Roadmap focuses on **on-page content** - what you should create or improve on your own website.

### How It Works
- Analyzes prompt execution data directly from the database
- Calculates where competitors are winning and you're not appearing
- Uses algorithmic scoring (no LLM) to prioritize gaps

### Features
- **Three tabs**: Recommendations, Content Gaps, By Topic
- **Gap scoring**: Based on competitor visibility vs. your visibility
- **Topic-level analysis**: Groups prompts by category/topic with win rates

### What You Get

#### Content Gaps
For each gap identified:
- The prompt where competitors are winning
- Which competitors are appearing
- Your visibility % vs. competitor visibility %
- Sources being cited by AI models
- Gap score (higher = more important)

#### Topic Analysis
For each topic area:
- Number of prompts in that topic
- Your win rate vs. competitor win rate
- Top competitors in that topic
- Top sources being cited

#### Recommendations
- Type: New content or content upgrade
- Priority level
- Suggested content format (guide, comparison, tutorial, etc.)
- Key topics to cover
- Competitor sources to reference

---

## Off-Page & PR (`/dashboard/offpage-roadmap`)

The Off-Page & PR page focuses on **external visibility** - getting mentioned on third-party sites that AI models cite.

### How It Works
- Categorizes all sources from prompt executions by type
- Identifies platforms where you should be present
- Prioritizes outreach targets based on impact and frequency

### Features
- **Four tabs**: Outreach Targets, Editorial, UGC & Community, Reference
- **Source categorization**: Automatically classifies sources
- **Platform-specific strategies**: Tailored engagement approaches

### Source Types

| Type | Description | Examples |
|------|-------------|----------|
| **Editorial** | News, blogs, industry publications | TechCrunch, industry blogs, how-to guides |
| **UGC** | User-generated content platforms | Reddit, Quora, LinkedIn, Facebook groups |
| **Reference** | Authoritative reference materials | Wikipedia, documentation, directories |
| **Competitor** | Competitor websites | Direct competitor domains |

### What You Get

#### Outreach Targets
Prioritized list of sites to target with:
- Domain and source type
- Frequency (how often cited by AI)
- Impact score
- Effort estimate (low/medium/high)
- Suggested outreach approach

#### Editorial Opportunities
- Publications to pitch
- Suggested pitch angles
- Topics they cover
- Competitor presence on that site

#### UGC & Community
Platform-specific strategies:
- Reddit: Relevant subreddits, engagement tips
- LinkedIn: Content strategy
- Quora: Questions to answer
- Forums: Communities to join

#### Reference Sources
- Directories to get listed in
- Documentation to contribute to
- Reference sites to target

---

## When to Use Each Feature

### Use Actions when you want:
- AI-generated, detailed recommendations
- Step-by-step guidance on what to do
- Both on-page and off-page strategies in one place
- Personalized insights with reasoning

### Use Content Roadmap when you want:
- Focus specifically on your website content
- See raw data on content gaps
- Analyze performance by topic/category
- Understand which content formats to use

### Use Off-Page & PR when you want:
- Focus on external distribution
- Plan outreach campaigns
- Identify specific platforms to target
- Understand source type distribution

---

## Data Flow

```
Prompt Executions
       │
       ├──► Actions API ──► LLM Processing ──► AI Recommendations
       │
       ├──► Content Roadmap API ──► Gap Analysis ──► Content Priorities
       │
       └──► Off-Page API ──► Source Categorization ──► Outreach Targets
```

All three features analyze the same underlying data (prompt executions with sources, brand mentions, and competitor mentions) but present it in different ways for different use cases.
