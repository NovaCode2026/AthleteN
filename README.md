<div align="center">

# 🥋 **AthleteN**

### **THE ATHLETE OPERATING SYSTEM**

**Train Smarter. Compete Stronger.**

<p>
<img src="https://img.shields.io/badge/STATUS-ACTIVE-00C853?style=flat-square" alt="Active">
</p>

**WEB + ANDROID**  ·  **ATHLETE-FIRST**  ·  **TAEKWONDO-FOCUSED**  ·  **AI-ASSISTED**

<sub>React 19 · TypeScript 6 · Expo 57 · Supabase</sub>

</div>

---

## ⚡ What is AthleteN?

**AthleteN** is a sports-focused platform designed around the real workflow of an athlete — not just a generic fitness tracker.

It brings **training, competitions, performance, plans, attendance, medals, documents, goals, nutrition, notifications, verification, coach/academy workflows, and AI-assisted guidance** into one athlete ecosystem.

> **An athlete should have one place to understand where they are, what they need to do next, and how they are progressing.**

AthleteN currently follows a **Taekwondo/Kyorugi-first** direction while its architecture is designed to expand to other sports.

---

## 🥋 The athlete journey

```text
ONBOARD → TRAIN → MEASURE → PLAN → COMPETE → REVIEW → IMPROVE
```

### 🏠 Dashboard
- Athlete overview and streaks
- Competition countdown
- Training minutes and sessions
- Performance trends
- Upcoming events
- Notifications and quick actions

### 🥊 Training & Performance
- Training sessions
- Performance history
- Goals and checklists
- Training plans
- Weight logging
- Competition preparation

### 🏆 Competition
- Tournaments and matches
- Medals and achievements
- Certificates
- Competition checklist
- Competition history

### 🤖 AI Coach
- Athlete-aware coaching experience
- Plan-aware usage limits
- Secure server-side AI requests
- Training and planning assistance

> AI features are assistance tools and do not replace qualified coaches or medical professionals.

### 👥 Coach & Academy
- Academy memberships
- Coach/athlete relationship foundation
- Attendance workflows
- Training plans
- Academy operations
- Role-aware experiences

### 📁 Athlete Records
- Profile and verification
- Documents
- Goals and injuries
- Notifications
- Feedback and support
- Badges and referrals

---

# 📱 Mobile App

The AthleteN mobile app uses **Expo + React Native + Expo Router** and follows the same AthleteN product direction as the web platform.

| 🏠 Home | 🏋️ Training | 🏆 Compete | 📷 Scanner | 👤 Profile |
|---|---|---|---|---|

Built for the moments athletes actually need it: **at training, on competition day, travelling, or checking progress quickly.**

### Mobile stability
- ✅ Dependency installation
- ✅ TypeScript
- ✅ ESLint
- ✅ Expo Doctor
- ✅ Expo Router entrypoint
- ✅ Supabase integration architecture
- ✅ Android configuration review

The mobile startup path has been hardened so an optional native Android widget cannot block app launch.

---

# 🧠 Product pillars

| Pillar | Purpose |
|---|---|
| 🥋 **Train** | Track and understand training |
| 📈 **Perform** | Turn activity into useful performance data |
| 🏆 **Compete** | Prepare for and record competitions |
| 🤖 **Intelligence** | AI-assisted athlete guidance |
| 👥 **Connect** | Athletes, coaches and academies |
| 🔐 **Protect** | Private, permission-aware athlete data |
| 🚀 **Grow** | Build a long-term athlete profile |

---

# 💳 AthleteN Plans

| Plan | Monthly | Yearly | AI messages / month |
|---|---:|---:|---:|
| 🆓 Free | ₹0 | ₹0 | — |
| 🎓 Student | ₹99 | ₹999 | 50 |
| 🚀 Pro | ₹199 | ₹1,999 | 200 |
| 🏅 Elite | ₹399 | ₹3,999 | 500 |
| 🧑‍🏫 Coach | ₹499 | ₹4,999 | 750 |
| 🏟️ Academy | ₹799 | ₹7,999 | 1,000 |

> Pricing is planned product information and may change before commercial launch.

---

# 🏗️ Architecture

```text
                 ┌─────────────────────┐
                 │     AthleteN Web    │
                 │ React + TS + Vite   │
                 └──────────┬──────────┘
                            │
                 ┌──────────▼──────────┐
                 │    AthleteN Mobile  │
                 │ Expo + React Native │
                 │     + Router        │
                 └──────────┬──────────┘
                            │
                 ┌──────────▼──────────┐
                 │      Supabase       │
                 │ Auth • Postgres     │
                 │ Storage • RLS       │
                 └──────────┬──────────┘
                            │
                 ┌──────────▼──────────┐
                 │ Server Functions    │
                 │ Secrets • AI • APIs │
                 └─────────────────────┘
```

### 🔐 Security principles
- Supabase Row Level Security
- Athlete-owned records private by default
- Server-side handling of AI credentials
- No frontend `OPENAI_API_KEY`
- No frontend Supabase service-role key
- Private storage for sensitive documents
- Role-aware athlete/coach/academy access

---

# 🛠️ Tech Stack

### Web
React • TypeScript • Vite • Supabase • Netlify Functions

### Mobile
React Native • Expo SDK 57 • Expo Router • React Navigation • Reanimated • Secure Store • Notifications

### Backend / Data
Supabase Auth • PostgreSQL • Row Level Security • Storage

### AI
Server-side AI integration • Athlete context • Plan-aware usage controls

---

# 📂 Repository structure

```text
AthleteN/
├── src/                         # Web application
├── AthleteN-Mobile/             # Expo mobile application
│   ├── src/app/
│   ├── src/components/
│   ├── src/context/
│   └── src/lib/
├── netlify/functions/           # Secure server functions
├── supabase/                    # Schema, policies, storage
├── docs/                        # Product and engineering docs
└── .github/workflows/           # CI and validation
```

---

# 🚀 Getting Started

## Web

```bash
npm install
npm run dev
```

Build:

```bash
npm run build
```

Frontend environment:

```env
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
```

Server environment:

```env
OPENAI_API_KEY=
OPENAI_MODEL=
```

**Never commit secrets.**

## 📱 Mobile

```bash
cd AthleteN-Mobile
npm install
npx expo start --clear
```

Android:

```bash
npx expo start --android
```

Native Android build:

```bash
npx expo run:android
```

### Recommended workflow

```text
SYNC → INSTALL → CLEAR CACHE → LAUNCH → TEST
```

---

# 🧪 Validation

Mobile validation:

```bash
cd AthleteN-Mobile
npm ci
npx tsc --noEmit
npx eslint .
npx expo-doctor
```

Current mobile gate:

- 🟢 Install
- 🟢 TypeScript
- 🟢 ESLint
- 🟢 Expo Doctor

GitHub Actions also provide automated repository validation.

---

# 🗄️ Supabase Setup

Run SQL in this order:

1. `supabase/schema.sql`
2. `supabase/policies.sql`
3. `supabase/storage.sql`

Then configure authentication, redirect URLs, storage policies, RLS and environment variables.

---

# 🌐 Deployment

### Netlify
1. Connect the GitHub repository.
2. Build command: `npm run build`
3. Publish directory: `dist`
4. Functions directory: `netlify/functions`
5. Configure environment variables.
6. Deploy.

Never expose:

- ❌ `OPENAI_API_KEY`
- ❌ Supabase service-role key
- ❌ Payment secrets
- ❌ Webhook signing secrets

---

# 🥋 Taekwondo-first

AthleteN is intentionally more than a generic workout tracker.

It is built around concepts such as:

**Kyorugi • Poomsae • Tournaments • Matches • Medals • Training • Weight • Coaches • Academies • Competition preparation**

> **Start with Taekwondo. Build the operating system for athletes.**

---

# 🗺️ Product Direction

### Current
Dashboard • Mobile • Training • Competitions • Profile • Supabase • Coach/academy foundation • AI-assisted features

### Next
Analytics • Attendance • Coach workflows • Training-plan marketplace • Competition tooling • Mobile parity • Production billing

### Later
Multi-sport support • Advanced athlete intelligence • Academy management • Deeper performance analytics • Larger athlete ecosystem

---

# 🤝 Project & Licence

AthleteN is maintained by **Nova Code**.

The project is **proprietary software** and is **not MIT licensed** unless a component is explicitly identified as separately licensed.

See [LICENSE](./LICENSE) for the complete terms.

---

<div align="center">

## 🥋 Train. Compete. Improve. Repeat.

**AthleteN — built for athletes who want more than a scoreboard.**

Made with ⚡ by **Nova Code**

</div>
