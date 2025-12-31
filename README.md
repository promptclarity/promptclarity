# Prompt Clarity

Track and analyze your brand's visibility across AI-powered search platforms.

## Overview

Prompt Clarity monitors how AI models like ChatGPT, Claude, Gemini, Perplexity, and Grok mention and recommend your business in response to relevant search prompts. As AI assistants become a primary way people discover products and services, understanding your brand's presence in these platforms is critical for marketing strategy.

**Key Use Cases:**
- Track how often AI recommends your brand vs competitors
- Identify which sources AI models cite when discussing your industry
- Monitor sentiment and context of AI-generated mentions
- Measure visibility trends over time across multiple platforms
- Generate actionable insights for content and SEO strategy

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         Browser (User)                          │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Next.js Application                        │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐  │
│  │   React UI      │  │   API Routes    │  │   NextAuth      │  │
│  │   (Dashboard)   │  │   (/api/*)      │  │   (Auth)        │  │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘  │
│                                │                                 │
│                    ┌───────────┴───────────┐                    │
│                    ▼                       ▼                    │
│          ┌─────────────────┐    ┌─────────────────┐             │
│          │  Prompt         │    │  Analysis       │             │
│          │  Execution      │    │  Service        │             │
│          │  Service        │    │  (OpenAI)       │             │
│          └─────────────────┘    └─────────────────┘             │
└─────────────────────────────────────────────────────────────────┘
         │                                      │
         ▼                                      ▼
┌─────────────────┐            ┌─────────────────────────────────┐
│    SQLite DB    │            │       AI Platform APIs          │
│  (data/store.db)│            │  ┌───────┐ ┌───────┐ ┌───────┐  │
│                 │            │  │OpenAI │ │Claude │ │Gemini │  │
│  - Businesses   │            │  └───────┘ └───────┘ └───────┘  │
│  - Prompts      │            │  ┌───────┐ ┌───────┐            │
│  - Executions   │            │  │Perplex│ │ Grok  │            │
│  - Users        │            │  └───────┘ └───────┘            │
└─────────────────┘            └─────────────────────────────────┘
```

**Components:**
- **Frontend**: React with Tailwind CSS and shadcn/ui components
- **Backend**: Next.js API routes with TypeScript
- **Database**: SQLite with automatic migrations
- **Authentication**: NextAuth.js with credentials and optional Google OAuth
- **AI Integration**: Vercel AI SDK for multi-provider support
- **Scheduling**: node-cron for automated prompt execution

## Quick Start

Run your own instance with a single command:

```bash
docker run -d -p 3000:3000 -v ./data:/app/data promptclarity/promptclarity
```

Then open **http://localhost:3000** and follow the setup wizard.

### Docker Options

```bash
# Run on a different port (e.g., 8080)
docker run -d -p 8080:3000 -v ./data:/app/data promptclarity/promptclarity

# Run with custom domain
docker run -d -p 3000:3000 -v ./data:/app/data \
  -e NEXTAUTH_URL=https://clarity.yourdomain.com \
  promptclarity/promptclarity
```

| Environment Variable | Description | Default |
|---------------------|-------------|---------|
| `NEXTAUTH_URL` | Your app's public URL | `http://localhost:3000` |
| `NEXTAUTH_SECRET` | Auth encryption secret | Auto-generated |

### Updating

```bash
docker pull promptclarity/promptclarity
docker stop <container-id> && docker rm <container-id>
docker run -d -p 3000:3000 -v ./data:/app/data promptclarity/promptclarity
```

---

## Development Setup

For local development or building from source:

### Prerequisites

- Node.js 18.17 or later
- npm or yarn
- API keys from at least one AI platform (see [Configuration](#configuration))

### Setup

```bash
# Clone the repository
git clone https://github.com/verobytes/PromptClarity.git
cd PromptClarity

# Install dependencies
npm install

# Create environment file
cp .env.example .env.local

# Generate auth secret and add to .env.local
openssl rand -base64 32

# Start development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) and follow the setup wizard.

### Build Docker Image Locally

```bash
docker build -t prompt-clarity .
docker run -d -p 3000:3000 -v prompt-clarity-data:/app/data prompt-clarity
```

## Configuration

### Environment Variables

| Variable | Required | Description | Example |
|----------|----------|-------------|---------|
| `NEXTAUTH_SECRET` | Yes | Secret for encrypting sessions | `openssl rand -base64 32` output |
| `NEXTAUTH_URL` | Yes | Base URL of your application | `http://localhost:3000` |
| `GOOGLE_CLIENT_ID` | No | Google OAuth client ID | `123...apps.googleusercontent.com` |
| `GOOGLE_CLIENT_SECRET` | No | Google OAuth client secret | `GOCSPX-...` |
| `CRON_SECRET` | No | Secret for cron job authentication | Any secure random string |
| `CRON_SCHEDULE` | No | Cron expression for scheduled runs | `0 */6 * * *` (every 6 hours) |
| `RESEND_API_KEY` | No | Resend API key for team invites | `re_...` |
| `RESEND_FROM_EMAIL` | No | Email sender address | `noreply@yourdomain.com` |

### AI Platform API Keys

API keys are configured through the UI during onboarding, not via environment variables. You'll need keys from the platforms you want to monitor:

| Platform | Get API Key |
|----------|-------------|
| ChatGPT | [platform.openai.com/api-keys](https://platform.openai.com/api-keys) |
| Claude | [console.anthropic.com](https://console.anthropic.com/) |
| Gemini | [aistudio.google.com/apikey](https://aistudio.google.com/apikey) |
| Perplexity | [perplexity.ai/settings/api](https://www.perplexity.ai/settings/api) |
| Grok | [console.x.ai](https://console.x.ai/) |

## Deployment

### Build for Production

```bash
# Build the application
npm run build

# Start production server
npm start
```

### Deploy to Render

1. Create a new Web Service on Render
2. Connect your GitHub repository
3. Configure:
   - **Build Command**: `npm install && npm run build`
   - **Start Command**: `npm start`
4. Add environment variables in Render dashboard
5. Deploy

### Deploy to Fly.io

```bash
# Install flyctl
curl -L https://fly.io/install.sh | sh

# Launch (creates fly.toml)
fly launch

# Set secrets
fly secrets set NEXTAUTH_SECRET="your-secret" NEXTAUTH_URL="https://your-app.fly.dev"

# Deploy
fly deploy
```

### Database & Migrations

SQLite database is created automatically at `data/store.db`. Migrations run on application startup. For production, ensure the `data/` directory is persisted (use a volume mount).

**Rollback**: Migrations include `down()` methods. To manually rollback:
1. Stop the application
2. Connect to SQLite: `sqlite3 data/store.db`
3. Run the down migration SQL manually
4. Update `schema_migrations` table

## Usage

### Typical User Flow: Initial Setup

1. **Create Account** - Visit `/setup` to create the owner account
2. **Add Business** - Enter business name and website URL
3. **Select Topics** - Choose or customize industry topics (e.g., "VPN software", "network security")
4. **Generate Prompts** - AI suggests relevant search prompts; customize as needed
5. **Add Competitors** - Enter competitor names to track alongside your brand
6. **Configure Platforms** - Select AI platforms and enter API keys
7. **Run Initial Scan** - Execute prompts across all configured platforms

### Typical User Flow: Daily Monitoring

1. **View Dashboard** - Check visibility score and platform breakdown at `/dashboard`
2. **Review Sources** - See which websites AI cites at `/dashboard/sources`
3. **Analyze Sentiment** - Check mention context at `/dashboard/sentiment`
4. **Compare Competitors** - Track relative positioning at `/dashboard/competitors`
5. **Refine Prompts** - Add/modify prompts based on insights at `/dashboard/prompts`

### API Example: Execute Prompts

```bash
# Trigger prompt execution for a business
curl -X POST http://localhost:3000/api/prompts/executions \
  -H "Content-Type: application/json" \
  -d '{"businessId": 1, "promptIds": [1, 2, 3]}'

# Response
{
  "success": true,
  "executionId": "exec_abc123",
  "status": "running"
}
```

### API Example: Get Visibility Data

```bash
# Fetch dashboard overview
curl http://localhost:3000/api/dashboard/overview?businessId=1

# Response
{
  "visibilityScore": 72,
  "mentionCount": 45,
  "platforms": {
    "chatgpt": { "score": 80, "mentions": 12 },
    "claude": { "score": 65, "mentions": 10 },
    ...
  }
}
```

## Troubleshooting

### Application won't start

**Symptom**: `npm run dev` fails immediately

**Causes & Fixes**:
- Missing Node.js: Install Node.js 18.17+
- Missing dependencies: Run `npm install`
- Port in use: Kill process on port 3000 or use `PORT=3001 npm run dev`

### Authentication errors

**Symptom**: "NEXTAUTH_SECRET missing" or redirect loops

**Fixes**:
- Ensure `NEXTAUTH_SECRET` is set in `.env.local`
- Ensure `NEXTAUTH_URL` matches your actual URL (no trailing slash)
- Clear browser cookies and try again

### API key errors

**Symptom**: "Invalid API key" when running prompts

**Fixes**:
- Verify key is correct in Settings > Models
- Check the key has sufficient credits/quota
- Ensure the key has required permissions (some providers restrict models)

### Database locked errors

**Symptom**: "SQLITE_BUSY: database is locked"

**Fixes**:
- Only run one instance of the application
- If using external tools, close SQLite connections
- Restart the application

### Prompts not executing

**Symptom**: Scheduled prompts don't run

**Fixes**:
- Check `CRON_SCHEDULE` format is valid
- Verify the scheduler started (check logs for "Scheduler initialized")
- For production, ensure the process stays running (use pm2 or similar)

### No data appearing in dashboard

**Symptom**: Dashboard shows "No data" after running prompts

**Fixes**:
- Wait for execution to complete (check Prompts page for status)
- Verify at least one platform is configured with a valid API key
- Check browser console for API errors
- Ensure the correct business is selected (check localStorage)

### Team invites not sending

**Symptom**: Invite emails not received

**Fixes**:
- Configure `RESEND_API_KEY` environment variable
- Verify domain is configured in Resend dashboard
- Check spam folder
- Use the manual invite link shown in the UI as fallback

### Memory issues with large datasets

**Symptom**: Application crashes during analysis

**Fixes**:
- Reduce number of prompts executed simultaneously
- Increase Node.js memory: `NODE_OPTIONS="--max-old-space-size=4096" npm run dev`
- Archive old execution data periodically

## Project Structure

```
app/
├── api/              # API routes
├── components/       # React components
├── dashboard/        # Dashboard pages
├── lib/
│   ├── db/           # Database & migrations
│   └── services/     # Business logic
├── onboarding/       # Setup wizard
└── setup/            # Initial setup
config/
└── platforms/        # AI platform config
data/
└── store.db          # SQLite database
```

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## License

GNU AGPL v3 License

## Support

For issues or questions, please create an issue on [GitHub](https://github.com/verobytes/PromptClarity/issues).
