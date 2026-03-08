# Numbers Don't Lie

App is available on URL: https://numbers-dont-lie-frontend-production.up.railway.app/

A wellness platform with AI-powered health insights, health tracking, and data visualization.

Testing question answers in testing_questions.md fail!

## Tech Stack

- **Backend:** NestJS + PostgreSQL + Prisma
- **Frontend:** Vanilla JavaScript + Chart.js
- **AI:** OpenAI gpt-4.1-mini
- **Deployment:** Railway

## Features

- Email/password registration with email verification
- OAuth 2.0 (Google + GitHub)
- JWT session management (access + refresh tokens)
- Password reset via email
- Two-Factor Authentication (TOTP)
- Health profile (demographics, physical metrics, fitness goals)
- BMI calculation and wellness score (0-100)
- Weight and activity logging with history
- Weekly and monthly summaries
- AI-powered personalized health insights with caching
- Charts and data visualization dashboard
- Privacy settings and data export (JSON)
- Rate limiting (60 req/min)

## Local Development


### Prerequisites

- Node.js 18+
- PostgreSQL 15+

### Setup

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd numbers-dont-lie
   ```

2. **Backend**
   ```bash
   cd backend
   cp .env.example .env
   # Fill in your values in .env
   npm install
   npx prisma migrate deploy
   npm run start:dev
   ```

3. **Frontend**
   ```bash
   cd frontend
   npm install
   npm run dev
   ```

   - Frontend: http://localhost:5173
   - Backend API: http://localhost:3000

### Environment Variables

Copy `backend/.env.example` to `backend/.env` and set the following:

| Variable | Description |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `JWT_ACCESS_SECRET` | Access token secret (min 32 chars) |
| `JWT_REFRESH_SECRET` | Refresh token secret (min 32 chars) |
| `ENCRYPTION_KEY` | Field encryption key (32 chars) |
| `FRONTEND_URL` | Frontend URL for CORS and redirects |
| `SMTP_HOST` | SMTP server host |
| `SMTP_PORT` | SMTP server port |
| `SMTP_USER` | SMTP username |
| `SMTP_PASSWORD` | SMTP password |
| `SMTP_FROM` | From address for emails |
| `GOOGLE_CLIENT_ID` | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret |
| `GOOGLE_CALLBACK_URL` | Google OAuth callback URL |
| `GITHUB_CLIENT_ID` | GitHub OAuth client ID |
| `GITHUB_CLIENT_SECRET` | GitHub OAuth client secret |
| `GITHUB_CALLBACK_URL` | GitHub OAuth callback URL |
| `OPENAI_API_KEY` | OpenAI API key |

> In development, emails are logged to the console instead of being sent.

## Deployment (Railway)

See [RAILWAY_DEPLOYMENT.md](RAILWAY_DEPLOYMENT.md) for full setup instructions.

The project uses two Railway services (backend + frontend) connected to a Railway PostgreSQL database.

## API Endpoints

### Auth
- `POST /auth/register` - Register
- `POST /auth/login` - Login
- `POST /auth/verify-email?code=` - Verify email
- `POST /auth/refresh` - Refresh access token
- `POST /auth/forgot-password` - Request password reset
- `POST /auth/reset-password` - Reset password
- `GET /auth/google` - Google OAuth
- `GET /auth/github` - GitHub OAuth
- `POST /auth/2fa/generate` - Generate 2FA secret
- `POST /auth/2fa/enable` - Enable 2FA
- `POST /auth/2fa/disable` - Disable 2FA

### Health Profile
- `POST /health-profile` - Create profile
- `GET /health-profile` - Get profile
- `PATCH /health-profile/:id` - Update profile
- `POST /health-profile/weight-history` - Log weight
- `GET /health-profile/weight-history` - Get weight history
- `POST /health-profile/activity` - Log activity
- `GET /health-profile/activity` - Get activity history
- `GET /health-profile/progress` - Goal progress
- `GET /health-profile/milestones` - Achievements
- `GET /health-profile/summary/weekly` - Weekly summary
- `GET /health-profile/summary/monthly` - Monthly summary

### AI
- `GET /ai/insights` - Get personalized insights (cached 24h)
- `GET /ai/insights/history` - Insight history
- `POST /ai/invalidate-cache` - Force regeneration

### Privacy
- `GET /privacy-settings` - Get settings
- `PATCH /privacy-settings` - Update settings
- `GET /data-export` - Export all user data (JSON)
