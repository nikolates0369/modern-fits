# Modern Market - Vercel + Supabase Migration

This project has been migrated from Heroku with file-based storage to Vercel with Supabase database.

## Setup Instructions

### 1. Supabase Setup
1. Go to [supabase.com](https://supabase.com) and create a new project
2. Go to your project dashboard > Settings > API
3. Copy your Project URL and anon/public key
4. Go to the SQL Editor and run the `supabase-setup.sql` file to create tables

### 2. Environment Variables
Update your `.env` file with your Supabase credentials:
```
SUPABASE_URL=your_supabase_project_url
SUPABASE_ANON_KEY=your_supabase_anon_key
SESSION_SECRET=your_random_session_secret
EMAIL_USER=your_email@gmail.com
EMAIL_PASS=your_app_password
```

### 3. Vercel Deployment
1. Install Vercel CLI: `npm i -g vercel`
2. Run `vercel` in the project directory
3. Follow the prompts to create a new project
4. Set environment variables in Vercel dashboard:
   - Go to your project > Settings > Environment Variables
   - Add all variables from your `.env` file

### 4. Local Development
```bash
npm install
npm run dev
```

## Database Schema

- **admins**: Admin user accounts
- **products**: Product catalog
- **customers**: Customer accounts
- **orders**: Customer orders
- **contact**: Contact information

## Migration Notes

- File-based storage replaced with Supabase PostgreSQL
- Session management remains the same
- Email functionality preserved
- All API endpoints updated to use Supabase queries