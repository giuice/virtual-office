# Virtual Office

A Next.js application providing a virtual workspace for remote teams, with real-time collaboration features.

## Features

- **Company Management**: Create and manage virtual companies
- **User Profiles**: Manage user identities and statuses
- **Virtual Floor Plan**: Navigate the office visually
- **User Statuses**: See who's online, busy, or away
- **Message Feed**: Company-wide communication
- **Database Integration**: AWS DynamoDB for persistent storage

## Getting Started

First, set up your environment variables:

```bash
# Copy the example environment file
cp env.example .env.local

# Edit .env.local with your AWS and Firebase credentials
```

Then install dependencies:

```bash
npm install
```

Run the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## Database Setup

Before using the app, you need to set up the DynamoDB tables:

1. Make sure your AWS credentials are configured in `.env.local`
2. Run the setup endpoint:

```bash
curl http://localhost:3000/api/setup-dynamo-tables(deprecated now we are using supabase)
```

## Admin Tools

### Company Cleanup Tool

If you encounter issues with duplicate companies, you can use the cleanup tool:

1. Access the tool at [http://localhost:3000/tools/cleanup-companies](http://localhost:3000/tools/cleanup-companies)
2. The tool will:
   - Identify users with multiple companies
   - Keep the most recent company
   - Remove duplicates
   - Update user profiles

## Documentation

- **Database Schema**: See [docs/database.md](./docs/database.md)
- **Architecture Decisions**: See [docs/adr/](./docs/adr/)
- **Changelog**: See [changelog.md](./changelog.md)

## Recent Updates

- Fixed issue with duplicate company creation
- Added company cleanup functionality
- Enhanced route protection to prevent redirection loops
- Improved database integrity checks

## Development

This project uses:

- Next.js App Router
- AWS DynamoDB for database
- Firebase for authentication
- Tailwind CSS for styling
- TypeScript for type safety
