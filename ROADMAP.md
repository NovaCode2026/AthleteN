# Roadmap

## Version 2.0.0

- React/Vite/TypeScript production app
- Supabase Authentication
- Supabase Postgres schema with Row Level Security
- Private Supabase Storage buckets
- Netlify OpenAI function
- Plans, student verification, feedback, roadmap, admin foundation, AI usage tracking schema, payment scaffold, dashboard, profile, tournaments, training, medals, documents, weight tracking, checklist, goals, and AI coach

## Near-Term

- Server-enforced AI quota writes and monthly usage summaries
- Razorpay, Stripe, and Cashfree checkout/webhook Netlify Functions
- File upload UI for profile images, medals, certificates, verification proofs, and documents
- Athlete Resume PDF generator
- Supabase realtime notifications
- Import workflow for legacy AthleteOS backups
- Test suite with component and integration coverage

### Tournament Scanner — Reel Intelligence

- Support accessible Instagram Reels as a tournament information source
- Extract useful video frames throughout a Reel, including poster/schedule slides and scene changes
- Run OCR on relevant Reel frames
- Extract accessible Reel audio and generate a transcript for tournament-related speech
- Combine caption, frame OCR, and audio evidence without treating any single source as automatically correct
- Classify dates by meaning so tournament dates, reporting/check-in dates, registration deadlines, and other dates remain separate
- Detect conflicting facts instead of silently selecting or inventing a value
- Require source evidence for every structured tournament field
- Never promote OCR noise or unsupported inference into a structured fact
- Show only important tournament information in the normal AthleteN UI; keep raw OCR/debug/source data out of the main result
- Display Not found in accessible source when an important field is unavailable
- Preserve source evidence internally so extracted facts can be traced back to the accessible Reel content

## Future

- Offline-first caching for recently viewed athlete data
- Coach, academy, and parent views with explicit permission sharing
- Federation-specific event-source adapters
- Mobile install prompts and push notifications
- Advanced performance analytics and season reports
