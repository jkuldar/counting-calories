# Testing Questions — Answers

---

## AI & Personalisation

**Student can explain how PII removal affects AI model's ability to generate personalized recommendations**

The system removes direct identifiers before building the AI prompt. The real `userId` is replaced with a SHA-256 hash truncated to 16 characters (`anonymizeUserId()`). No email address or name is ever included. Instead, only anonymised health metrics are passed: age, gender, physical measurements, lifestyle indicators, goals, and progress scores. The result is that the model cannot correlate insights across sessions or identify the individual, but it still receives all health-relevant context needed to produce accurate, personalised recommendations. The trade-off is that the model cannot reference previous conversations by identity — but all relevant health state is re-injected each call through the structured prompt, so personalisation quality is not meaningfully reduced.

---

**Student can explain their strategy for detecting and handling AI hallucinations in health recommendations**

After each OpenAI response, `validateResponse()` in `ai.service.ts` checks the text for:
1. **Dietary/allergy violations** — scans response text for any word that matches the user's declared restrictions or allergies. If found, `violatesRestrictions` is set to `true` and the insight is flagged.
2. **Unsafe weight-loss rates** — regex patterns detect claims like "lose 3 kg per week". Anything above 1 kg/week is flagged.
3. **Hallucination markers** — patterns like "lose weight overnight", "miracle", "instant results", "100% guaranteed" are caught and flagged as unrealistic.
4. **Goal relevance** — checks that goal-specific keywords (e.g., "weight loss", "calorie deficit") appear in the response for the user's stated goal.

Insights that `violatesRestrictions` are excluded from normal retrieval (the DB query filters `violatesRestrictions: false`). The system prompt also instructs the model never to contradict allergies, never to suggest unsafe weight-loss rates, and never to provide medical diagnoses.

---

## Authentication

**User receives an email with verification link after registration**

Yes. `authService.register()` creates the user, generates a 32-byte cryptographically random `verificationCode`, stores it in the database, and calls `sendVerificationEmail()`. The email contains a link pointing to the frontend with `?code=<token>`. The frontend intercepts this in `checkAuth()` and calls `POST /auth/verify-email` with the code. Until the email is verified, login is blocked (`'Email not verified'` error).

---

**Authentication options include email-password and at least 2 OAuth providers**

Three authentication methods are available:
- **Email + password** with bcrypt (salted, 10 rounds)
- **Google OAuth 2.0** via `passport-google-oauth20`
- **GitHub OAuth** via `passport-github2`

Both OAuth providers are loaded conditionally based on environment variables (`GOOGLE_CLIENT_ID/SECRET`, `GITHUB_CLIENT_ID/SECRET`).

---

**Password reset is handled via email**

Yes. `POST /auth/forgot-password` looks up the user, generates a random reset token stored (hashed) in the database with an expiry, then sends an email with `?token=<raw>`. The frontend detects `?token=` and presents a reset form. `POST /auth/reset-password` verifies the token hash, checks expiry, and updates the password.

---

**Users can optionally enable two-factor authentication**

Yes. 2FA is TOTP-based using the `otplib` library.
1. `POST /auth/2fa/generate` — generates a secret, stores it temporarily, returns a QR code data URL.
2. `POST /auth/2fa/enable` — user submits the first code from their authenticator app; if valid, `twoFactorEnabled` is set to `true` in the database.
3. `POST /auth/2fa/disable` — requires a valid current token to disable.
4. On login: if `twoFactorEnabled` is true, the server returns `{ requires2FA: true }` when no token is provided. The frontend shows a second step where the user enters the 6-digit code, which is verified via `POST /auth/2fa/verify`.

---

**Verify functionality of 2FA**

To verify: register and log in normally, navigate to the profile/settings section, generate a QR code, scan with an authenticator app (e.g., Google Authenticator), submit the displayed code to enable 2FA. Log out. On next login with the same credentials, the system returns `requires2FA: true` and a second input appears for the TOTP code. Entering a valid code completes authentication; entering a wrong or expired code returns an error.

---

**User cannot access protected routes without verifying email**

Correct. `authService.login()` checks `user.emailVerified` before issuing tokens. If not verified, it throws `'Email not verified'` and no JWT is issued. All API routes beyond `/auth/*` are protected by `JwtAuthGuard`, which validates the Bearer token — so an unverified user can never obtain a valid access token.

---

## JWT & Token Management

**Student can explain the security implications of access token duration in JWT authentication**

Access tokens are stateless — once issued, the server cannot revoke them before expiry. A short duration (15 minutes) limits the damage window if a token is stolen: the attacker has at most 15 minutes before it becomes invalid. A longer duration would make the system more convenient but significantly increases exposure in case of interception (e.g., via a compromised log file or network capture). Refresh tokens are long-lived (7 days) but are stored as bcrypt hashes in the database and can be invalidated server-side by simply clearing the hash, giving meaningful revocation control for the long-lived credential.

---

**Access token expires after [x] minutes of inactivity**

Access tokens expire 15 minutes after issuance (`expiresIn: '15m'` in `generateTokens()`). The expiry is absolute (not sliding/inactivity-based). The `lastActivityAt` timestamp on the user is updated on each token refresh, but it does not extend the access token itself — it serves as an audit field.

---

**New access token is issued when valid refresh token is provided**

Yes. `POST /auth/refresh` accepts `{ refreshToken }` in the body. The service verifies the JWT signature, finds the user, compares the token against the stored bcrypt hash with `bcrypt.compare()`, and if valid issues a new access token (15m) without rotating the refresh token.

---

**Verify receiving new access token by sending a request with expired access token and valid refresh token**

1. Log in to receive `accessToken` and `refreshToken`.
2. Wait 15 minutes (or use a test token with a past `exp` claim).
3. Make any authenticated API call — it will return HTTP 401.
4. The frontend automatically catches the 401 in `api.request()`, calls `refreshTokens()` which posts to `POST /auth/refresh` with the stored refresh token from `localStorage`, receives a new `accessToken`, stores it, and retries the original request transparently.

---

## Data & Privacy

**Platform provides clear data usage consent with explicit user approval before data collection**

The profile form includes a required checkbox: *"I consent to storing my health data securely"*. The backend enforces this: `createOrUpdateProfile()` rejects the request if no existing profile exists and `consentGiven` is false. Consent timestamp is stored alongside the flag. AI data sharing is a separate, independently toggleable setting in Privacy Settings (`shareWithAI`).

---

**At minimum, it includes what data is collected and how it's used**

The consent checkbox in the profile form is accompanied by explanatory copy. The Privacy Settings page shows exactly which data categories are shared with AI (weight, activity, dietary, goals, medical) and allows each to be toggled independently. The data export (`GET /health-profile/export`) lets users see exactly what is stored.

---

**Platform collects basic demographics, physical metrics, lifestyle indicators, dietary preferences and restrictions, wellness goals**

Yes — the profile form collects:
- **Demographics**: age, gender
- **Physical metrics**: height (cm or ft/in), current weight, target weight
- **Lifestyle**: activity level, sleep hours/day, stress level, occupation type
- **Dietary**: preferences (e.g., vegetarian, keto), allergies, restrictions (e.g., gluten-free)
- **Wellness goals**: primary goal (lose/gain/maintain/muscle/fitness), target date, weekly activity target

---

**User data is encrypted in transit and at rest**

- **In transit**: TLS is used in production (Railway provides HTTPS automatically; the backend also supports self-signed certificates via `certs/cert.pem` and `certs/key.pem`).
- **At rest**: sensitive fields `medicalConditions` and `medications` are encrypted with AES-256-GCM before being written to PostgreSQL. Each value is stored as `enc:<12-byte IV hex>:<ciphertext hex>:<16-byte auth tag hex>`. The key is derived from the `ENCRYPTION_KEY` environment variable via SHA-256. Decryption happens transparently whenever the profile is read. All other fields rely on PostgreSQL's standard storage security and Railway's infrastructure-level encryption at rest.

---

**Platform collects initial fitness assessment data**

Yes. The profile form has a dedicated "Fitness Assessment" section that collects:
- Fitness level (beginner / intermediate / advanced)
- Preferred exercise environment (home / gym / outdoors / mixed)
- Preferred time of day (morning / afternoon / evening)
- Typical session duration (15–30 min, 30–60 min, 60+ min)
- Exercise types (cardio, strength, flexibility, sports, HIIT, cycling, swimming)
- Endurance baseline (how long they can run/walk without stopping, in minutes)
- Max push-ups in one set
- Max squats in one set

---

**Student can explain how normalization of health metrics impacts data visualization accuracy**

All physical measurements are stored in SI units (kg, cm) regardless of how the user entered them. The profile form supports imperial input (feet/inches, lbs) but converts to metric (`feetInchesToCm()`, lbs → kg) before saving. This means all chart calculations, BMI computation, and wellness score inputs are always operating on the same scale. If values were stored in mixed units, chart Y-axes would not be comparable across data points and BMI calculations would be incorrect.

---

**Health metrics are converted to standard units before storage**

Yes. Imperial inputs (height in feet/inches, weight in lbs) are converted to cm/kg on the frontend using `feetInchesToCm()` and a lbs-to-kg factor before the API call is made. The backend stores only metric values.

---

**Platform allows user to change their data sharing preferences**

Yes. The Privacy Settings page (`/privacy-settings`) allows toggling:
- `shareWithAI` — master switch for AI insights
- `shareAnonymousData` — anonymous analytics (currently unused)
- `allowDataExport` — GDPR export
- `includeWeight` — whether weight data goes to AI context
- `includeActivity` — whether activity data goes to AI context
- `includeDietary` — whether dietary data goes to AI context
- `includeGoals` — whether goals go to AI context
- `includeMedical` — whether medical conditions/medications go to AI context (off by default)

---

**Historical weight changes are tracked with timestamps**

`WeightHistory` records are created with `recordedAt: new Date()` each time `addWeightEntry()` is called. The history is returned ordered by `recordedAt` and displayed in the weight progress chart.

---

**Verify each weight entry has a unique timestamp by adding multiple entries and checking their history display**

The `WeightHistory` table has a `@@unique([userId, recordedAt])` constraint in the Prisma schema. If two entries are submitted at the exact same millisecond timestamp, the database returns a unique constraint violation (`P2002`), which the service catches and converts to a `BadRequestException('Duplicate weight entry for this timestamp')`. In practice, rapid manual submissions will differ by at least a millisecond and succeed; the constraint prevents automated duplicates.

---

**System prevents duplicate activity entries for the same timestamp**

Yes. `ActivityEntry` has `@@unique([userId, loggedAt])`. The service wraps the `create` call and catches `P2002` to return `BadRequestException('Duplicate activity entry for this timestamp')`.

---

## Wellness Score

**Student can explain how BMI classifications affect wellness score calculation**

The wellness score is a weighted composite of four components:
- **BMI score** (30%) — Normal BMI = 100 pts, Underweight/Overweight = 70 pts, Obese = 50 pts, Severely obese = 30 pts
- **Activity score** (30%) — active days this week vs. weekly activity goal, capped at 100
- **Goal progress score** (20%) — linear 0–100 based on weight progress towards target
- **Habits score** (20%) — habit streak days / 7, capped at 100

So a user in the "normal" BMI range starts with 30 points from the BMI component; an obese user starts with only 15 points from that component. BMI class has the single largest individual impact on the score.

---

**Wellness score changes when user updates their weekly activity frequency**

Yes. `recalculateDerivedMetrics()` is called after every activity entry, weight entry, and profile update. Inside `computeWellnessScore()`, `activeDays` (distinct days with logged activity in the last 7 days) is divided by `weeklyActivityGoal`. Changing the goal denominator or adding new activity entries both change the activity score component and therefore the total wellness score.

---

**Student can explain their choice of AI model(s) based on response quality and latency requirements**

The model used is `gpt-4.1-mini`. This was chosen because it offers much lower latency and cost than full GPT-4 while still producing coherent, contextually aware health recommendations at a quality level suitable for wellness guidance (not medical advice). The response is capped at 500 tokens and `temperature: 0.7` keeps answers varied but grounded. For a wellness app where insights are cached 24 hours anyway, GPT-4.1-mini's faster and cheaper profile is the right tradeoff — full GPT-4 class quality is not necessary for motivational fitness summaries.

---

**Student can explain what model capabilities were most important for their implementation**

Instruction-following fidelity was most important: the model must reliably avoid mentioning allergens/restricted foods and must not suggest unsafe practices, even when the user's health data would naively point in that direction. Secondarily, the ability to produce structured numbered lists (1., 2., 3.) matters because the frontend parser uses regex to split the response into individual recommendation cards. The model's relatively small context window is handled by truncating the prompt to 3000 characters when needed.

---

**System recalculates wellness score components when any contributing metric changes**

Yes. `recalculateDerivedMetrics()` is triggered in `createOrUpdateProfile()`, `addWeightEntry()`, `addActivityEntry()`, and `addHabitLog()`. It recomputes BMI, progress percent, activity streak, habit streak, and wellness score, then writes all of them back to the `HealthProfile` row in a single `update`.

---

**Verify scores update when changing: BMI range, activity level, goal progress, or health habits**

- **BMI**: Submit a new weight entry — BMI recalculates, and the BMI score component (30%) changes accordingly. Dashboard refreshes on next load.
- **Activity level**: Log or remove an activity entry — the activity score component (30%) updates.
- **Goal progress**: Change target weight in the profile, or add a new weight entry — the progress percent and its score component (20%) update.
- **Health habits**: Log a habit via the API — the habit streak and its score component (20%) update.

All of these call `recalculateDerivedMetrics()` which writes the new wellness score to the DB. The dashboard reads it on next load or manual refresh.

---

## AI Insights

**System generates different health insights when user's goals change**

Yes. The AI context includes `goals.primaryGoal`. The context hash is computed over the full serialised context object (`generateContextHash()` uses `JSON.stringify` + SHA-256). When the goal changes, the hash changes, and the cache lookup finds no matching valid insight — triggering a new OpenAI API call. The system prompt and prompt text explicitly include the primary goal and target date.

---

**Verify insight adjustment after changing user goals from one type to another (e.g., weight loss to muscle gain)**

1. Set primary goal to "Lose Weight" in the profile form.
2. Request AI insights — note the recommendation content (will reference calorie deficit, cardio, etc.).
3. Change primary goal to "Build Muscle".
4. Request AI insights again — the context hash is different, so a fresh API call is made. The new recommendations will reference resistance training, protein intake, progressive overload, etc.

---

**Student can explain the difference between AI response caching and regeneration**

Caching returns the last stored `AIInsight` row that has a matching `contextHash` and has not expired (TTL 24 hours). This means identical health context produces the same response without hitting the OpenAI API. Regeneration happens when: (a) no cached insight exists for the current context hash, (b) the cached insight has expired, (c) the health context changed (new weight, changed goal, new activity) producing a different hash, or (d) the user manually requests a refresh. Caching reduces API cost and latency; regeneration ensures freshness when data changes.

---

**Student can explain how context length affects AI response quality in health recommendations**

A longer context allows the model to consider more data points (recent activity history, weight trend, medical conditions) and produce more specific advice. However, very long prompts increase latency, cost, and the risk of the model losing track of the most important signals. The implementation caps the prompt at 3000 characters (`MAX_CONTEXT_LENGTH`). Within that budget, the prompt prioritises: goals, physical metrics, recent activity (last 7 days, up to 10 entries), and weight trend (last 30 days, up to 10 entries). Medical conditions are only included if the user has enabled that in Privacy Settings.

---

**AI recommendations include specific references to user's stated fitness goals**

Yes. The prompt explicitly states the primary goal (e.g., `Primary Goal: lose_weight`) and the validation step checks that goal-specific keywords appear in the response. If the response does not mention goal-related keywords, `validationNotes` records `'Does not clearly address stated goal'` and `isValid` is set to `false`. The frontend only shows insights where `isValid` is `true`.

---

**Verify recommendations explicitly mention and align with the specific fitness goal set in user profile**

Set the primary goal to "Improve Fitness" in the profile form and request AI insights. The response should contain words like "cardio", "endurance", "stamina", or "conditioning". Change the goal to "Build Muscle" and refresh insights — the response should now reference "resistance training", "strength", "protein", or "muscle". The `validateResponse()` function verifies this automatically and marks non-compliant responses as invalid.

---

**AI health insights exclude any personally identifiable information**

The `buildHealthContext()` function never passes email, name, or the real database `userId` to the prompt. The userId is replaced with a 16-character SHA-256 hash. The system prompt explicitly tells the model it is receiving anonymous health data. No PII is stored in the `AIInsight.prompt` or `AIInsight.response` database columns.

---

**Student can explain their prompt engineering approach to ensure consistent health recommendation format**

The user-facing prompt ends with an explicit output instruction:
> "Please provide: 1. A brief assessment of their current progress; 2. 2–3 specific, actionable recommendations; 3. Encouragement and next steps. Keep the response concise, practical, and motivating."

This consistently produces numbered lists (1., 2., 3.) which the frontend parser (`_parseInsightRecommendations()`) splits into individual recommendation cards using a regex pattern. A fallback splits by double newlines (paragraphs) if numbered formatting is not used, and a final fallback treats the entire response as one card.

---

**System implements response validation to filter out recommendations that don't match user's health restrictions — Ask the students to describe their approach**

After the OpenAI response is received, `validateResponse()` iterates over the user's declared dietary restrictions and allergies and checks whether any of those words appear in the response text (case-insensitive substring match). If a restricted food or allergen is mentioned, `violatesRestrictions` is set to `true`. Separately, regex patterns check for unsafe weight-loss claims and hallucination markers. The DB query that retrieves insights for display filters with `violatesRestrictions: false`, so flagged insights are silently excluded and the fallback returns the last clean cached insight instead.

---

**Student can explain the tradeoffs between zero-shot and few-shot prompting in their implementation**

The implementation uses **zero-shot prompting** — the system prompt defines the model's role and safety rules, and the user prompt provides structured health data with an explicit output format request. Few-shot would mean providing example input/output pairs inside the prompt to demonstrate the expected format. The advantage of few-shot is more consistent formatting and style; the disadvantage is that examples consume tokens (reducing available context budget) and can bias the model toward the example's specific phrasing. Given the 3000-character context cap and the need to fit real user data, zero-shot with a clear output instruction was chosen as the better tradeoff.

---

**System displays cached recommendations when AI service is unavailable**

Yes. If the OpenAI API call fails for any reason (including missing `OPENAI_API_KEY`), `getInsight()` falls through to `getLastValidInsight()` which returns the most recent `AIInsight` row regardless of `contextHash` or expiry, as long as it has `isValid: true` and `violatesRestrictions: false`. The returned object includes `fromCache: true` so the frontend can optionally indicate that insights are not fresh.

---

**Verify system shows most recent cached recommendations when AI service connection is disabled**

1. Request AI insights once while the service is working — an insight is saved to DB.
2. Remove or invalidate `OPENAI_API_KEY` in the backend environment.
3. Request insights again — the backend catches the API error, calls `getLastValidInsight()`, and returns the previously cached insight with `fromCache: true`.
4. The dashboard still shows the recommendations (no blank state).

---

## Summaries

**System generates weekly and monthly health summaries including progress and key metrics**

Yes. `GET /health-profile/summary?period=week` and `?period=month` return:
- Total activity minutes for the period
- Number of distinct active days
- Number of activity entries
- Weight change over the period
- Average weight
- Wellness score change (current minus score at period start)
- Progress percentage change

The Comparison View displays both weekly and monthly summaries side-by-side with a toggle.

---

**Verify health summary includes week's activity levels, wellness score changes, and progress towards goals**

On the Comparison View, toggle to "Weekly". The "Weekly Progress" section shows:
- Activity: total minutes, distinct active days, number of entries
- Weight change (kg) over the week
- Wellness score change vs. start of the week
- Goal progress change (percentage points)

---

## Dashboard & Visualisation

**Health Dashboard shows BMI, wellness score, progress towards goals and AI insights based on user data**

Yes. The dashboard `stats-grid` shows four cards:
1. **BMI** — calculated value with classification label (underweight / normal / overweight / obese)
2. **Wellness Score** — numeric value out of 100 with a filled progress bar
3. **Goal Progress** — percentage toward goal with next milestone indicator
4. **Current / Target Weight** — both values and remaining kg

Below the stats: activity and habit streaks, AI insight cards, quick-action buttons.

---

**Progress chart shows weight tracking over time, wellness score evolution and activity level changes**

The Charts view renders three panels:
1. **Weight Progress** — line chart (Chart.js) of all weight entries sorted by `recordedAt`, with a dashed reference line at target weight if set.
2. **Weekly Activity Heatmap** — GitHub-style 12-week heatmap (custom HTML/CSS, no external library) showing daily activity intensity across Mon–Sun columns.
3. **Wellness Score History** — line chart of daily wellness score snapshots for the last 30 days.

---

**Goal progress includes milestone tracking**

Every 5 percentage points of progress toward the goal is treated as a milestone. `calculateNextMilestone()` computes the next multiple of 5 above the current progress. The dashboard shows `"🎯 Next milestone: X%"` when the next milestone is above the current progress. The Progress card also shows a filled progress bar and the current percentage.

---

**Milestone example**
- **Weight**: every 5% toward the target weight (a user at 20 kg to lose gets milestones at 1 kg, 2 kg, etc. lost).
- **Activity**: each consecutive active day increments the activity streak displayed as a badge.
- **Habits**: each consecutive day with a logged habit increments the habit streak badge.

---

**Comparison view shows current vs target metrics, weekly/monthly progress comparison, health trend analysis and AI recommendations**

The Comparison View contains four sections:
1. **Current vs Target** — metric comparison cards for weight, BMI, activity level, and wellness score (current value vs target, with a progress indicator).
2. **Weekly/Monthly Progress** — period summary with activity totals, weight change, wellness score delta.
3. **Health Trend Analysis** — narrative text derived from the period data.
4. **AI Recommendations** — same insight cards as the dashboard, showing prioritised recommendations.

---

**Student can explain how data visualization choices affect user's understanding of progress**

Chart.js line charts were chosen for weight and wellness score because continuous time-series data is best understood as a trend, not individual data points. The target weight is rendered as a dashed horizontal reference line so users immediately see how close they are to their goal without having to read numbers. The activity heatmap was chosen instead of a bar chart to give an intuitive day-of-week and recency view — the same format GitHub uses for contributions — making streaks and gaps immediately visible. `responsive: true` and `maintainAspectRatio: true` ensure charts scale correctly on mobile without clipping data.

---

**AI insights are visually presented with priority-based highlighting**

Each insight card is a `<details>` element with class `priority-high`, `priority-medium`, or `priority-low`. Each shows a colour-coded badge ("High Priority", "Medium Priority", "Low Priority"). The card is collapsed by default, showing only the priority badge and a 160-character preview. Clicking the summary expands it to show the full recommendation text.

---

**Verify insights are displayed with high/medium/low priority indicators and include expandable details**

Request AI insights with a complete profile. Each card in the "AI Insights" section shows a coloured badge label. Clicking a card expands it inline (native `<details>/<summary>` HTML). Priority is calculated by the backend: unhealthy BMI adds 3 points, medical conditions add 2, close target date adds 2, low wellness score below 40 adds 2, active goal adds 1. Scores ≥ 5 = high, 2–4 = medium, < 2 = low.

---

**Weight progress chart displays goal weight as a reference line**

Yes. In `renderWeightChart()`, if `profile.targetWeightKg` is set, a second dataset is added with `Array(labels.length).fill(targetWeight)`, styled with a dashed border (`borderDash: [5, 5]`) and no fill. This renders as a flat dashed red line across the chart labelled "Target Weight".

---

**Charts resize without data loss on mobile devices**

Chart.js is initialised with `responsive: true` and `maintainAspectRatio: true` (aspect ratio 2:1). When the viewport changes, Chart.js recalculates canvas dimensions and redraws all data points — no data is discarded. The activity heatmap is a CSS flexbox grid that wraps and scrolls horizontally on very narrow screens.

---

## Error Handling & Reliability

**Student can explain the impact of missing health data on AI recommendation accuracy**

Missing data means some sections of the prompt are omitted entirely (each section is guarded by `if (context.physical)`, `if (context.goals)`, etc.). Without weight data, the model cannot assess BMI trends; without a goal, the model's recommendations are generic. The prompt still runs and produces output, but the advice is less targeted. The wellness score uses `50` (neutral) as a fallback for any component where data is missing, so the score stays meaningful but not precise.

---

**Error messages appear without page reload when API requests fail**

All form submissions use `event.preventDefault()`. Errors returned from the API are caught in the `catch` block and displayed inline in `<span class="error" data-field="...">` elements or via `showToast()` — no navigation or reload occurs. The dashboard uses a `showError()` method that replaces section content with an error message and a Retry button. The API layer's `request()` method throws typed errors with `status` and `data` properties that callers can inspect.

---

**Submit health profile form with invalid BMI value (e.g., -1) and verify error message appears without page refresh**

The frontend validates numeric fields before the API call. Height and weight inputs have `min` attributes (`min="50"` for height cm, `min="20"` for weight kg). If invalid values are entered, the browser's native constraint validation fires on submit, or the custom `validatePositiveNumber()` helper in `utils.js` is used — showing an inline error message under the field without a page reload. The backend additionally rejects nonsensical BMI values: `calculateBMI()` returns `{ bmi: null, bmiClass: null }` for zero or negative inputs, preventing storage of invalid derived metrics.

---

**Student can explain their approach to preventing API abuse through rate limiting**

The `@nestjs/throttler` module is registered globally in `AppModule` as an `APP_GUARD`. The configuration is `ttl: 60_000` (60-second window) and `limit: 60` requests per window per IP. This means each IP address can make at most 60 requests per minute. The guard runs before any controller method. When the limit is exceeded, NestJS returns HTTP 429 Too Many Requests automatically.

---

**System blocks rapid-fire API requests from the same user**

Yes — rate limiting is enforced globally via `ThrottlerGuard`. The default `ThrottlerGuard` uses the client IP address as the key. Any client sending more than 60 requests within a 60-second window receives a 429 response for subsequent requests until the window resets.

---

**Verify rate limit kicks in after [x] requests within 1 minute**

The limit is **60 requests per 60 seconds**. To verify: send 61 rapid requests to any API endpoint from the same IP (e.g., `GET /health`). The 61st request will return `HTTP 429 Too Many Requests`. The window resets 60 seconds after the first request in the current window.

---

**Health data export includes all historical metrics and timestamps**

`GET /health-profile/export` returns a JSON object containing:
- `user` — id, email, emailVerified, createdAt, updatedAt
- `healthProfile` — full decrypted profile (including medicalConditions and medications in plain text)
- `weightHistory` — all entries ordered by `recordedAt` asc
- `activityEntries` — all entries ordered by `loggedAt` asc
- `habitLogs` — all entries ordered by `loggedDate` asc
- `privacySettings` — current settings
- `exportedAt` — ISO timestamp of the export

---

**Student can explain the tradeoffs of their chosen data visualization library**

Chart.js was chosen over alternatives (Recharts, D3, Highcharts) for the following reasons:
- **Bundle size**: Chart.js with tree-shaking is lighter than D3 for simple line/bar charts.
- **Ease of use**: Declarative configuration with minimal boilerplate — suitable for a project that does not require complex custom SVG graphics.
- **Responsiveness**: Built-in `responsive` mode handles container resizing without extra code.
- **Tradeoffs**: Chart.js is less flexible than D3 for complex custom visualisations. The activity heatmap is implemented manually in HTML/CSS instead of using Chart.js because Chart.js does not have a native heatmap type, and writing it by hand was simpler than importing a third-party extension.

---

**Dashboard loads placeholder UI when data is being fetched**

Yes. `Dashboard.load()` calls `this.showSkeleton()` immediately, which renders three `<div class="skeleton-card"></div>` elements. These have a CSS shimmer animation. Once both the profile and AI insights API calls resolve (via `Promise.all`), `render()` replaces the skeleton with real content. Same pattern is used in `ComparisonView.showSkeleton()`.

---

**The README file contains a clear project overview, setup instructions, and usage guide**

Yes. `README.md` contains: project overview, technology stack, local development setup (environment variable configuration, Docker Compose and manual steps), deployment instructions for Railway, and a usage guide covering all features.

---

**The code is well-organized, properly commented, and follows best practices for the chosen programming language(s)**

The backend follows NestJS conventions: one module per concern (`auth`, `health-profile`, `ai`, `privacy-settings`), services separated from controllers, guards for authentication, strategies for OAuth. Each service method has a JSDoc comment. TypeScript is used throughout with typed interfaces for all data structures. The frontend separates concerns into individual class files per view (Dashboard, Charts, ComparisonView, ProfileForm, Auth, PrivacySettings) with a single `API` service class. Constants are not hardcoded in logic; environment variables control all runtime configuration.

---

## Extra

**Project runs entirely through Docker with a single command**

Not implemented as a core deliverable — this was listed under "Extra requirements" in `project.md`. The project runs locally with `docker compose up` (which starts the Prisma-backed PostgreSQL instance) plus separate `npm run start:dev` commands, or entirely on Railway where deployment is handled by the platform.

---

**Quality of AI-generated health insights and progress evaluations during testing**

Insights from `gpt-4.1-mini` at `temperature: 0.7` are generally specific and actionable given the provided context. The structured prompt (demographics → physical → lifestyle → dietary → goals → fitness → progress → recent activity → weight trend) gives the model sufficient context to reference actual numbers (e.g., "your current BMI of 27.3 is in the overweight range"). Priority scoring ensures the most clinically relevant issues are highlighted first. Caching prevents redundant calls when data has not changed.

---

**Relevance and practicality of AI-generated weekly and monthly health summaries and recommendations**

The `getSummary()` endpoint aggregates real activity, weight, and wellness data for the period. This structured data is displayed on the Comparison View. AI recommendations on the same page come from the same cached insight generated from the full health context, which includes goal alignment, dietary restrictions, and recent activity patterns — making them practically relevant to where the user is in their health journey.

---

**System's handling of AI service limitations during testing (rate limits, availability)**

The `getInsight()` method has a three-tier fallback:
1. **Cache hit** — returns stored insight if context hash matches and TTL not expired.
2. **API failure** — if the OpenAI call throws any error (rate limit, timeout, network failure, missing key), falls through to `getLastValidInsight()`.
3. **No cache** — returns `{ reason: 'unavailable', insight: null }` and the dashboard shows a human-readable placeholder message instead of a blank or error state.

---

**Student has implemented additional technologies, security enhancements and/or features beyond the core requirements**

Additional implementations beyond the core spec:
- **AES-256-GCM field-level encryption** for `medicalConditions` and `medications` at rest, with backward-compatible decryption of plain-text legacy values.
- **TOTP two-factor authentication** using `otplib`, with QR code generation.
- **OAuth one-time code exchange** — OAuth tokens are never exposed in the browser URL; a single-use 60-second server-side code is used instead (prevents token leakage via browser history or Referer headers).
- **Automatic JWT refresh** — the frontend API layer transparently refreshes expired access tokens and retries the failed request, with `auth:expired` event fallback to redirect to login.
- **Activity heatmap** — GitHub-style 12-week activity grid built without an external library.
- **Imperial/metric unit toggle** in the profile form with automatic conversion.
- **GDPR-compliant data export** covering all stored data categories with timestamps.
- **Email verification** and **password reset** flows via SMTP or Resend API.
- **Per-category privacy controls** for AI data sharing (7 independent toggles).
