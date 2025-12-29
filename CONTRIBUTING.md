# Contributing to Prompt Clarity

Thank you for your interest in contributing to Prompt Clarity!

## Getting Started

1. Fork the repository
2. Clone your fork: `git clone https://github.com/YOUR_USERNAME/lucidgeo.git`
3. Install dependencies: `npm install`
4. Create a branch for your changes: `git checkout -b feature/your-feature-name`

## Development Setup

```bash
# Copy environment file
cp .env.example .env.local

# Generate auth secret
openssl rand -base64 32
# Add the output to NEXTAUTH_SECRET in .env.local

# Start development server
npm run dev
```

## Code Style

- Use TypeScript for all new code
- Follow existing patterns in the codebase
- Use meaningful variable and function names
- Add comments for complex logic

## Database Changes

When making changes that affect the database schema:

1. Create a migration file: `app/lib/db/migrations/0XX_description.ts`
2. Follow the template in `app/lib/db/migrations/TEMPLATE.txt`
3. Implement both `up()` and `down()` methods
4. Add the migration to `app/lib/db/migrations/index.ts`
5. Test the migration locally before submitting

See `app/lib/db/migrations/README.md` for detailed migration guidelines.

## Submitting Changes

1. Ensure your code builds: `npm run build`
2. Test your changes locally
3. Commit with clear, descriptive messages
4. Push to your fork
5. Open a Pull Request against `main`

## Pull Request Guidelines

- Provide a clear description of the changes
- Reference any related issues
- Include screenshots for UI changes
- Ensure all checks pass

## Reporting Issues

When reporting issues, please include:

- Steps to reproduce the problem
- Expected vs actual behavior
- Browser/Node.js version
- Relevant error messages or logs

## Questions?

Open an issue with the "question" label or start a discussion.
