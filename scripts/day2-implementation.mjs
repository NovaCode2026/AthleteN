import fs from 'node:fs';

const appPath = 'src/App.tsx';
let app = fs.readFileSync(appPath, 'utf8');
const replaceOnce = (anchor, replacement) => {
  if (!app.includes(anchor)) throw new Error(`Missing App anchor: ${anchor.slice(0, 80)}`);
  app = app.replace(anchor, replacement);
};

replaceOnce(
  'import ProfileIdentityCard from "./components/profile/ProfileIdentityCard";',
  'import ProfileIdentityCard from "./components/profile/ProfileIdentityCard";\nimport TaekwondoHub from "./components/taekwondo/TaekwondoHub";'
);
replaceOnce(
  'import type { ChecklistItem, CloudData, DocumentRecord, FeedbackItem, Goal, Medal as MedalRecord, AiUsageEvent, Profile, RoadmapItem, RoadmapVote, Subscription, SubscriptionUsage, TournamentScan, TrainingSession, Tournament, UsageSummary, VerificationRequest, WeightLog } from "./types";',
  'import type { ChecklistItem, CloudData, DocumentRecord, FeedbackItem, Goal, Medal as MedalRecord, AiUsageEvent, Profile, RoadmapItem, RoadmapVote, Subscription, SubscriptionUsage, TournamentScan, TrainingSession, Tournament, UsageSummary, VerificationRequest, WeightLog, KyorugiBout, PoomsaePerformance, TaekwondoTrainingLog } from "./types";'
);
replaceOnce(
  'type PageId = "dashboard" | "profile" | "plans" | "verification" | "tournaments" | "training" | "medals" | "documents" | "weight" | "calendar" | "checklist" | "scanner" | "ai" | "feedback" | "roadmap" | "messages" | "admin";',
  'type PageId = "dashboard" | "profile" | "plans" | "verification" | "tournaments" | "training" | "medals" | "documents" | "weight" | "calendar" | "checklist" | "scanner" | "ai" | "feedback" | "roadmap" | "messages" | "taekwondo" | "admin";'
);
replaceOnce(
  'const nav: Array<[PageId, string, typeof Activity]> = [["dashboard", "Dashboard", Activity],',
  'const nav: Array<[PageId, string, typeof Activity]> = [["dashboard", "Dashboard", Activity],["taekwondo", "Taekwondo", Activity],'
);
replaceOnce(
  'function pageFromPath(): PageId { const path = window.location.pathname; if (path === "/admin") return "admin";',
  'function pageFromPath(): PageId { const path = window.location.pathname; if (path === "/taekwondo") return "taekwondo"; if (path === "/admin") return "admin";'
);
replaceOnce(
  '["full_name","username","date_of_birth","profile_image_path","weight_kg","height_cm","belt","academy","coach","emergency_contact","achievements"]',
  '["full_name","username","date_of_birth","gender","sport","discipline","profile_image_path","weight_kg","height_cm","belt","academy","coach","emergency_contact","achievements"]'
);
replaceOnce(
  'const data: CloudData = { profile: {}, tournaments: [], training: [], medals: [], weights: [], goals: [], checklist: [], documents: [], notifications: [], feedback: [], verifications: [], roadmap: [], roadmapVotes: [], tournamentScans: [], aiUsage: [], subscriptions: [], subscriptionUsage: [] };',
  'const data: CloudData = { profile: {}, tournaments: [], training: [], medals: [], weights: [], goals: [], checklist: [], documents: [], notifications: [], feedback: [], verifications: [], roadmap: [], roadmapVotes: [], tournamentScans: [], aiUsage: [], subscriptions: [], subscriptionUsage: [], kyorugiBouts: [], poomsaePerformances: [], taekwondoTraining: [] };'
);
replaceOnce(
  'const [tournaments, training, medals, weights, goals, checklist, documents, notifications, feedback, verifications, roadmapRows, roadmapVotes, tournamentScans, aiUsage, subscriptions, subscriptionUsage] = await Promise.all([',
  'const [tournaments, training, medals, weights, goals, checklist, documents, notifications, feedback, verifications, roadmapRows, roadmapVotes, tournamentScans, aiUsage, subscriptions, subscriptionUsage, kyorugiBouts, poomsaePerformances, taekwondoTraining] = await Promise.all(['
);
replaceOnce(
  'loadUserRows<SubscriptionUsage>("subscriptionUsage", { order: "usage_month", ascending: false })]); setHasProfile(profileComplete); setData({ profile, tournaments, training, medals, weights, goals, checklist, documents, notifications, feedback, verifications, roadmap: roadmapRows.map((item) => ({ ...item, user_has_voted: roadmapVotes.some((vote) => vote.roadmap_item_id === item.id) })), roadmapVotes, tournamentScans, aiUsage, subscriptions, subscriptionUsage });',
  'loadUserRows<SubscriptionUsage>("subscriptionUsage", { order: "usage_month", ascending: false }), loadUserRows<KyorugiBout>("kyorugiBouts", { order: "event_date", ascending: false }), loadUserRows<PoomsaePerformance>("poomsaePerformances", { order: "event_date", ascending: false }), loadUserRows<TaekwondoTrainingLog>("taekwondoTraining", { order: "session_date", ascending: false })]); setHasProfile(profileComplete); setData({ profile, tournaments, training, medals, weights, goals, checklist, documents, notifications, feedback, verifications, roadmap: roadmapRows.map((item) => ({ ...item, user_has_voted: roadmapVotes.some((vote) => vote.roadmap_item_id === item.id) })), roadmapVotes, tournamentScans, aiUsage, subscriptions, subscriptionUsage, kyorugiBouts, poomsaePerformances, taekwondoTraining });'
);
replaceOnce(
  'const path=id==="admin"?"/admin":id==="messages"?"/messages":id==="scanner"?"/scanner":"/";',
  'const path=id==="admin"?"/admin":id==="messages"?"/messages":id==="scanner"?"/scanner":id==="taekwondo"?"/taekwondo":"/";'
);
replaceOnce(
  'else if(page==="dashboard")content=<Dashboard data={data} usage={usage} openForm={openForm}/>;',
  'else if(page==="dashboard")content=<Dashboard data={data} usage={usage} openForm={openForm}/>; else if(page==="taekwondo")content=<TaekwondoHub profile={data.profile} kyorugiBouts={data.kyorugiBouts||[]} poomsaePerformances={data.poomsaePerformances||[]} taekwondoTraining={data.taekwondoTraining||[]} setToast={setToast} refresh={refresh}/>;'
);
const onboardingStart = app.indexOf('function OnboardingPage(');
const appShellStart = app.indexOf('function AppShell()', onboardingStart);
if (onboardingStart < 0 || appShellStart < 0) throw new Error('Onboarding boundaries missing');
const onboarding = `function OnboardingPage({ profile, saveProfile }: { profile: Profile; saveProfile: (values: Partial<Profile>)=>Promise<void> }) { const [values,setValues]=useState<Partial<Profile>>({full_name:profile.full_name||"",username:profile.username||"",date_of_birth:profile.date_of_birth||"",gender:profile.gender||"",sport:"taekwondo",discipline:profile.discipline,academy:profile.academy||"",coach:profile.coach||""}); const [saving,setSaving]=useState(false); const [error,setError]=useState(""); async function submit(event:React.FormEvent){event.preventDefault();setError("");if(!values.full_name?.trim()||!values.date_of_birth||!values.gender||values.sport!=="taekwondo"||!values.discipline||!values.academy?.trim()||!values.coach?.trim()){setError("Name, DOB, gender, Taekwondo, discipline, club, and coach are required.");return;}setSaving(true);try{await saveProfile(values);}catch(saveError){setError(saveError instanceof Error?saveError.message:"Profile could not be saved. Please try again.");}finally{setSaving(false);}} return <main className="onboarding-page"><section className="auth-card"><span className="eyebrow">First setup</span><h1>Set up your Taekwondo profile</h1><p>Taekwondo is currently the implemented sport. Choose your discipline explicitly so Kyorugi and Poomsae data never get mixed.</p><form onSubmit={submit}><Field label="Name" value={values.full_name||""} onChange={(event)=>setValues({...values,full_name:event.target.value})} required/><Field label="Username" value={String(values.username||"")} onChange={(event)=>setValues({...values,username:event.target.value.toLowerCase()})} maxLength={30} required/><Field label="Date of birth" type="date" value={String(values.date_of_birth||"")} onChange={(event)=>setValues({...values,date_of_birth:event.target.value})} max={new Date().toISOString().slice(0,10)} required/><SelectField label="Gender" value={values.gender||""} onChange={(event)=>setValues({...values,gender:event.target.value})} required><option value="">Select</option><option value="male">Male</option><option value="female">Female</option><option value="other">Other</option><option value="prefer_not_to_say">Prefer not to say</option></SelectField><SelectField label="Sport" value="taekwondo" disabled><option value="taekwondo">Taekwondo</option></SelectField><SelectField label="Discipline" value={values.discipline||""} onChange={(event)=>setValues({...values,discipline:event.target.value as "kyorugi"|"poomsae"})} required><option value="">Choose your discipline</option><option value="kyorugi">Kyorugi</option><option value="poomsae">Poomsae</option></SelectField><Field label="Club" value={values.academy||""} onChange={(event)=>setValues({...values,academy:event.target.value})} placeholder="Club / independent athlete" required/><Field label="Coach" value={values.coach||""} onChange={(event)=>setValues({...values,coach:event.target.value})} placeholder="Coach / not connected yet" required/><button className="btn primary" disabled={saving}>{saving?"Saving…":"Save and continue"}</button></form>{error&&<p className="notice" role="alert">{error}</p>}</section></main>; }\n`;
app = app.slice(0, onboardingStart) + onboarding + app.slice(appShellStart);
fs.writeFileSync(appPath, app);

let types = fs.readFileSync('src/types.ts', 'utf8');
types = types.replace('export interface Profile { id?: string; user_id?: string; full_name?: string;', 'export interface Profile { id?: string; user_id?: string; full_name?: string; gender?: string;');
fs.writeFileSync('src/types.ts', types);

console.log('Day 2 implementation patch applied.');
