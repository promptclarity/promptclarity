# NetBird AI Insight Tracker - Setup Instructions

## Prerequisites

- Node.js 18.17 or later
- npm or yarn package manager

## Installation Steps

1. **Extract the zip file** to your desired location

2. **Install dependencies:**
   ```bash
   npm install
   ```
   or
   ```bash
   yarn install
   ```

3. **Set up environment variables:**
   Create a `.env.local` file in the root directory with the following:
   ```
   # AI Provider Configuration (choose one)
   AI_PROVIDER=openai  # or 'anthropic'
   
   # If using OpenAI
   OPENAI_API_KEY=your-openai-api-key-here
   
   # If using Anthropic
   ANTHROPIC_API_KEY=your-anthropic-api-key-here
   ```

4. **Run the development server:**
   ```bash
   npm run dev
   ```
   or
   ```bash
   yarn dev
   ```

5. **Open your browser** and navigate to:
   ```
   http://localhost:3000/onboarding
   ```

## Project Structure

- `/app` - Next.js app directory with pages and API routes
- `/app/api` - Backend API endpoints
- `/app/components` - React components
- `/app/lib` - Utilities, types, and database setup
- `/public` - Static assets
- `/data` - SQLite database (created automatically on first run)

## Features

- Business information collection
- AI-powered topic generation
- AI-powered search prompt generation
- Competitor tracking setup
- SQLite database for data persistence

## Troubleshooting

### Database Issues
- The SQLite database is created automatically in the `/data` directory
- If you encounter database errors, delete the `/data` folder and restart the app

### AI Generation Not Working
- Ensure you have set up the API keys correctly in `.env.local`
- Check that you have selected either 'openai' or 'anthropic' as your AI_PROVIDER
- The app will fall back to default suggestions if AI generation fails

### Port Already in Use
- If port 3000 is already in use, you can specify a different port:
  ```bash
  PORT=3001 npm run dev
  ```

## Notes

- This is a development build intended for local testing
- The database uses SQLite for simplicity (no external database required)
- All data is stored locally in the `/data` directory