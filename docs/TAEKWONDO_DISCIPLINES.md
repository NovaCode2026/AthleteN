# 🥋 AthleteN Taekwondo Disciplines

<div align="center">

<img src="https://img.shields.io/badge/SPORT-TAEKWONDO-0B1F3A?style=for-the-badge" alt="Taekwondo">
<img src="https://img.shields.io/badge/DISCIPLINES-KYORUGI%20%2B%20POOMSAE-00AEEF?style=for-the-badge" alt="Kyorugi and Poomsae">
<img src="https://img.shields.io/badge/CLIENTS-WEB%20%2B%20ANDROID-6C5CE7?style=for-the-badge" alt="Web and Android">

**Choose the sport first. Then choose the discipline. Keep the records separate.**

</div>

---

## 1. Current supported sport

AthleteN currently supports one sport vertical:

| Selection | Stored value | Availability |
|---|---|---|
| Taekwondo | taekwondo | Available now |

The sport selector is intentionally limited to Taekwondo for this release. Do not present Football, Karate, Boxing or other sports as supported until their workflows, data model, tools and acceptance tests exist.

## 2. Sport-first onboarding flow

The account setup sequence is:

~~~text
Choose Sport
    |
    v
Taekwondo
    |
    v
Choose Taekwondo Discipline
    |----------------------|
    v                      v
 Kyorugi                Poomsae
 Sparring               Forms
~~~

Canonical database values are lowercase:

- profiles.sport = taekwondo
- profiles.discipline = kyorugi or poomsae

Human-facing labels are title-cased: **Taekwondo**, **Kyorugi · Sparring**, and **Poomsae · Forms**. Keep display labels separate from database values.

The Web onboarding form and Android onboarding/Profile screens use the same two-step order: **1 · Sport** first, then **2 · Discipline** only after a supported sport is selected. New or incomplete profiles do not have a silently preselected sport or discipline. The user must select Taekwondo, then explicitly select Kyorugi or Poomsae before continuing. Changing the sport clears the dependent discipline so an old discipline cannot remain attached to a different sport. The current sport list contains only Taekwondo; do not show Football, Karate, Boxing or other unsupported options. When another sport is genuinely implemented, add only its own tested disciplines behind the same selector.

## 3. Discipline separation

Kyorugi and Poomsae are both Taekwondo, but they are not the same activity. The active discipline changes the labels, training inputs, performance records, statistics and dashboard emphasis.

| Area | Kyorugi | Poomsae |
|---|---|---|
| Workspace name | Kyorugi Hub | Poomsae Studio |
| Practice language | Sparring, rounds, footwork, defence, timing | Forms, stance, balance, accuracy, rhythm, presentation |
| Practice record | Rounds and fight-focused notes | Poomsae name, category, repetitions and focus |
| Competition record | Opponent, round, result, points and decision | Event, performed Poomsae, category, score, placing and result |
| Summary | Bouts, wins and losses | Practice logs, performances, scores and medals |
| History | Kyorugi bout and training history | Poomsae performance and training history |

Shared AthleteN features—profile, goals, documents, calendar, attendance, coach/academy connections, notifications and subscriptions—remain available to either discipline.

## 4. Poomsae tools

### 4.1 Poomsae forms catalogue

The current selector includes:

- Taegeuk 1 Jang through Taegeuk 8 Jang
- Koryo, Keumgang, Taebaek, Pyongwon, Sipjin
- Jitae, Cheonkwon, Hansu and Ilyeo

The catalogue is a starting list, not a claim that every competition uses the same forms. The athlete can use notes and the available category options for event-specific context.

### 4.2 Practice logging

Android Poomsae Studio supports a dedicated practice record with:

- Date
- Poomsae performed
- Category: Individual, Pair, Team, Freestyle or Other
- Training focus: stance and balance, technique accuracy, timing and rhythm, power and control, presentation or freestyle choreography
- Repetition count
- Notes

Practice is saved as a non-official Taekwondo training log with discipline = poomsae. Practice records are not stored as competition results.

### 4.3 Official performance logging

Android Poomsae Studio supports a separate official result record:

- Event/tournament name and date
- Poomsae performed
- Category
- Score on the current AthleteN 0–10 record scale
- Optional placing
- Result: Gold, Silver, Bronze, Placed or Not placed
- Notes

Scores and placings are entered as recorded by the event or supplied by the athlete/coach. AthleteN does not invent a score, calculate an official judging result or claim automated video judging.

### 4.4 Web Poomsae workspace

The Web Taekwondo Hub offers Poomsae-specific form selection, category, repetition-based practice, official event score/placing/result entry and Poomsae-specific history. The dedicated workspace label is **Poomsae Studio** (paired with **Kyorugi Hub** for sparring). Kyorugi and Poomsae practice records remain separate.

### 4.5 Shared labels and tools across clients

| Screen / action | Kyorugi | Poomsae |
|---|---|---|
| Workspace title | Kyorugi Hub | Poomsae Studio |
| Discipline choice | Kyorugi · Sparring | Poomsae · Forms |
| Training page (Android) | Kyorugi Training | Poomsae Training |
| Timed session (Android) | Kyorugi Session | Poomsae Session |
| Live session label (Android) | Live Kyorugi Session | Live Poomsae Session |
| Primary tools | Opponent, bout, round, result, athlete/opponent score, decision | Forms library, practice focus, category, repetitions, event score, placing and medal result |

Tool labels must follow the lowercase canonical profile discipline (`kyorugi` or `poomsae`), not title-case string comparisons. Both clients use the same saved Taekwondo domain records and display discipline-specific histories. Shared account features—profile, goals, documents, calendar, notifications, team connections and subscriptions—remain shared rather than being duplicated as separate Poomsae-only systems.

## 5. Kyorugi tools

Kyorugi remains a separate mode for sparring and match records. Its labels and fields include:

- Opponent and event
- Round
- Result
- Athlete and opponent score
- Decision and notes
- Kyorugi-specific training rounds and focus

The Android Hub and Web Taekwondo Hub must not display Kyorugi-only labels such as "bouts", "opponent" or "rounds" as Poomsae tools.

## 6. Shared data model

The current cross-client Taekwondo Hub uses these shared tables:

| Table | Purpose |
|---|---|
| profiles | Sport and selected discipline |
| taekwondo_training_logs | Practice sessions for either discipline; includes repetitions, Poomsae name and category |
| taekwondo_kyorugi_bouts | Kyorugi competition bouts |
| taekwondo_poomsae_performances | Poomsae official event performances |

The mobile UI reads and writes these same discipline-specific tables as the Web Taekwondo Hub so a record created on one client can appear in the other client, subject to the existing owner-scoped policies.

The database also contains earlier normalized tables named kyorugi_bouts, poomsae_performances, kyorugi_training_metrics and poomsae_training_metrics. The current shared Web/Android Hub does not use those parallel tables as its primary record path. Do not silently switch one client back to those tables or the two clients may show different histories. Any future consolidation must be handled as a reviewed migration with a backfill and duplicate audit.

## 7. Access control and data integrity

- The profile discipline is restricted to kyorugi or poomsae.
- The only currently supported sport value is taekwondo.
- Each athlete can access their own domain records under the existing RLS policies.
- Official competition results are separate from practice logs.
- Poomsae score input uses the current 0–10 UI/database rule in the Web legacy record path.
- Placing must be a positive whole number when supplied.
- Changing the selected discipline changes the active workspace; it does not relabel or convert historical records from the other discipline.

## 8. Key implementation files

| File | Responsibility |
|---|---|
| src/App.tsx | Web sport-first onboarding and profile editor |
| src/components/taekwondo/TaekwondoHub.tsx | Web discipline switcher, Kyorugi/Poomsae forms and result history |
| src/types.ts | Canonical Web discipline and record types |
| AthleteN-Mobile/src/components/onboarding-screen.tsx | First-time Android onboarding: Taekwondo sport selection, then discipline |
| AthleteN-Mobile/src/app/profile.tsx | Android sport and discipline selection in Profile |
| AthleteN-Mobile/src/context/AuthContext.tsx | Android canonical profile types |
| AthleteN-Mobile/src/app/home.tsx | Discipline-aware Android home labels and shortcuts |
| AthleteN-Mobile/src/app/taekwondo.tsx | Android Kyorugi Hub and Poomsae Studio |
| AthleteN-Mobile/src/app/training-session.tsx | Discipline-aware timed session flow |
| supabase/migrations/20260915000000_taekwondo_disciplines.sql | Taekwondo sport/discipline and domain record foundations |
| supabase/migrations/20260917150000_poomsae_training_details.sql | Poomsae name/category on practice logs |
| supabase/migrations/20260917120000_day3_core_integrity_fixes.sql | Separate Poomsae repetitions from Kyorugi rounds and score constraint |

## 9. Acceptance checklist

- [ ] New Web profile starts without a preselected sport or discipline.
- [ ] New Android profile starts without a preselected sport or discipline.
- [ ] Both clients reveal discipline choices only after Taekwondo is selected.
- [ ] Changing the sport clears the previously selected discipline.
- [ ] Profile save is blocked until the supported sport and a discipline are selected.
- [ ] Database saves only lowercase canonical values.
- [ ] Poomsae profile shows Poomsae Studio, Poomsae Training and Poomsae Session labels on Web and Android.
- [ ] Kyorugi profile shows Kyorugi Hub, Kyorugi Training and Kyorugi Session labels on Web and Android.
- [ ] Mobile Training and timed Session screens block discipline-specific logging until a discipline is selected.
- [ ] Poomsae practice saves as a non-official Poomsae training log.
- [ ] Poomsae official result saves to the shared Poomsae performance table.
- [ ] Poomsae records remain visible on Web after a mobile refresh, and vice versa.
- [ ] Kyorugi records remain separate from Poomsae records.
- [ ] RLS owner boundaries are verified with separate test accounts.
- [ ] Both Web and Android CI pass; Android receives a physical-device acceptance test.

---

**Product rule:** Taekwondo first. Kyorugi and Poomsae are separate disciplines. More sports come only when their actual workflows are ready.
