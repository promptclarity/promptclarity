# Daily Prompt Execution - Cron Setup

This application includes a daily cron job that automatically executes all prompts for all businesses once per day. The results are stored in the database with each day's date, allowing you to track brand visibility trends over time.

## How It Works

- **Endpoint**: `/api/cron/daily-executions`
- **Schedule**: Daily at 2:00 AM UTC (configurable)
- **Function**: Executes all prompts for all businesses across all configured AI platforms
- **Security**: Requires `CRON_SECRET` environment variable for authentication

## Setup Options

### Option 1: Vercel Deployment (Recommended for Vercel users)

The `vercel.json` file is already configured to run the cron job daily at 2:00 AM UTC.

1. **Set Environment Variable** in Vercel Dashboard:
   ```
   CRON_SECRET=your-secure-random-secret
   ```
   Generate a secure secret:
   ```bash
   openssl rand -base64 32
   ```

2. **Deploy to Vercel**:
   ```bash
   vercel deploy --prod
   ```

3. **Verify Setup**:
   - Go to Vercel Dashboard → Your Project → Cron Jobs
   - You should see: `/api/cron/daily-executions` scheduled for `0 2 * * *`

4. **Test the Cron** (optional):
   ```bash
   curl -X POST https://your-app.vercel.app/api/cron/daily-executions \
     -H "Authorization: Bearer YOUR_CRON_SECRET"
   ```

### Option 2: External Cron Service (For non-Vercel deployments)

Use services like [cron-job.org](https://cron-job.org), EasyCron, or your server's crontab.

1. **Set Environment Variable**:
   ```bash
   # Add to .env.local or your hosting platform
   CRON_SECRET=your-secure-random-secret
   ```

2. **Configure Cron Job**:
   - **URL**: `https://your-domain.com/api/cron/daily-executions`
   - **Schedule**: Daily at 2:00 AM (or your preferred time)
   - **Method**: GET or POST
   - **Headers**:
     ```
     Authorization: Bearer YOUR_CRON_SECRET
     ```

3. **Example with cron-job.org**:
   - Create account at https://cron-job.org
   - Click "Create Cron Job"
   - Set URL: `https://your-domain.com/api/cron/daily-executions`
   - Set Schedule: `0 2 * * *` (2 AM daily)
   - Add custom header: `Authorization: Bearer YOUR_CRON_SECRET`
   - Save and enable

4. **Example with Linux Crontab**:
   ```bash
   # Edit crontab
   crontab -e

   # Add line (runs at 2 AM daily):
   0 2 * * * curl -X POST https://your-domain.com/api/cron/daily-executions -H "Authorization: Bearer YOUR_CRON_SECRET"
   ```

### Option 3: Self-Hosted with node-cron (Advanced)

For applications running on persistent servers (not serverless).

1. **Install node-cron**:
   ```bash
   npm install node-cron
   ```

2. **Create scheduler** (`app/lib/cron-scheduler.ts`):
   ```typescript
   import cron from 'node-cron';

   // Run daily at 2:00 AM
   cron.schedule('0 2 * * *', async () => {
     console.log('[Cron] Running daily prompt executions...');
     try {
       const response = await fetch('http://localhost:3000/api/cron/daily-executions', {
         method: 'POST',
         headers: {
           'Authorization': `Bearer ${process.env.CRON_SECRET}`
         }
       });
       const result = await response.json();
       console.log('[Cron] Result:', result);
     } catch (error) {
       console.error('[Cron] Error:', error);
     }
   });
   ```

3. **Import in your server startup** (e.g., `server.ts` or `app/page.tsx`):
   ```typescript
   import './lib/cron-scheduler';
   ```

## Schedule Configuration

The default schedule is `0 2 * * *` (2:00 AM UTC daily). You can customize this using standard cron syntax:

```
┌───────────── minute (0 - 59)
│ ┌───────────── hour (0 - 23)
│ │ ┌───────────── day of month (1 - 31)
│ │ │ ┌───────────── month (1 - 12)
│ │ │ │ ┌───────────── day of week (0 - 6) (Sunday to Saturday)
│ │ │ │ │
│ │ │ │ │
* * * * *
```

**Examples**:
- `0 2 * * *` - Every day at 2:00 AM UTC
- `0 */6 * * *` - Every 6 hours
- `0 0 * * 0` - Every Sunday at midnight
- `0 8 * * 1-5` - Weekdays at 8:00 AM

To change the schedule in Vercel, update `vercel.json`:
```json
{
  "crons": [
    {
      "path": "/api/cron/daily-executions",
      "schedule": "0 8 * * *"  // 8 AM daily
    }
  ]
}
```

## Manual Testing

You can manually trigger the cron job for testing:

### Via curl:
```bash
curl -X POST http://localhost:3000/api/cron/daily-executions \
  -H "Authorization: Bearer YOUR_CRON_SECRET"
```

### Via browser (for development only):
1. Temporarily remove the auth check in the API route
2. Visit: `http://localhost:3000/api/cron/daily-executions`
3. **Remember to re-enable auth before deploying!**

## Monitoring & Logs

The cron job logs detailed information to help you monitor executions:

```
[Cron] Starting daily prompt executions...
[Cron] Found 2 business(es) to process
[Cron] Executing prompts for business: NetBird (ID: 1)
[Cron] Business 1 has 24 prompt(s)
[Cron] Successfully started execution for business 1
[Cron] Daily executions completed in 1234ms
```

**To view logs**:
- **Vercel**: Dashboard → Your Project → Logs
- **Self-hosted**: Check your server logs or console output

## Response Format

The cron endpoint returns detailed results:

```json
{
  "success": true,
  "message": "Daily prompt executions triggered",
  "executionTime": 1234,
  "businessesProcessed": 2,
  "results": [
    {
      "businessId": 1,
      "businessName": "NetBird",
      "status": "success",
      "promptCount": 24
    },
    {
      "businessId": 2,
      "businessName": "Another Business",
      "status": "skipped",
      "reason": "No prompts configured"
    }
  ]
}
```

## Troubleshooting

### 401 Unauthorized Error
- Check that `CRON_SECRET` environment variable is set
- Verify the Authorization header matches: `Bearer YOUR_CRON_SECRET`
- Ensure there are no extra spaces or newlines in the secret

### Cron Not Running on Vercel
- Verify `vercel.json` exists in the root directory
- Check Vercel Dashboard → Cron Jobs to confirm it's configured
- Cron jobs only work on **production** deployments, not preview deployments
- Ensure your Vercel plan supports Cron Jobs (Pro plan required)

### Executions Not Appearing in Database
- Check the logs for error messages
- Verify AI platform API keys are configured for each business
- Ensure prompts exist for the business
- Check that the `prompt_executions` table exists

### Time Zone Issues
- All cron schedules use UTC time
- To run at 2 AM in your local time:
  - EST (UTC-5): Use `0 7 * * *` (7 AM UTC)
  - PST (UTC-8): Use `0 10 * * *` (10 AM UTC)
  - CET (UTC+1): Use `0 1 * * *` (1 AM UTC)

## Security Best Practices

1. **Always use CRON_SECRET in production**
2. **Never commit .env files to version control**
3. **Rotate secrets periodically**
4. **Monitor cron job logs for unauthorized attempts**
5. **Use HTTPS for all cron endpoint calls**

## FAQ

**Q: How do I disable the cron job?**
A: Remove the cron configuration from `vercel.json` or disable it in your external cron service.

**Q: Can I run it more than once per day?**
A: Yes! Just change the schedule. For example, `0 */12 * * *` runs every 12 hours.

**Q: What happens if a business has no prompts?**
A: The cron job will skip that business and log it in the results.

**Q: Do old executions get deleted?**
A: No, all executions are kept in the database for historical analysis. You may want to implement cleanup logic if storage becomes a concern.

**Q: Can I trigger executions for just one business?**
A: Yes, use the existing UI "Execute All" button or call `/api/prompts/executions` with a specific businessId.
