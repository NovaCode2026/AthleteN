import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

test("Athlete Intelligence is a saved-record analytics destination, separate from AI Coach", () => {
  const tabs = read("../AthleteN-Mobile/src/app/(tabs)/_layout.tsx");
  const intelligence = read("../AthleteN-Mobile/src/app/ai.tsx");
  const coach = read("../AthleteN-Mobile/src/app/ai-coach.tsx");
  const more = read("../AthleteN-Mobile/src/app/explore.tsx");
  const home = read("../AthleteN-Mobile/src/app/home.tsx");

  assert.match(tabs, /\{id:'ai',label:'Intelligence',icon:'chart'/);
  assert.match(intelligence, /A data dashboard, not a chat/);
  assert.match(intelligence, /OPEN AI COACH/);
  assert.match(more, /title="Athlete Intelligence"[\s\S]*router\.push\('\/ai'\)/);
  assert.match(more, /title="AI Coach"[\s\S]*router\.push\('\/ai-coach'\)/);
  assert.match(home, /title="AI COACH"[\s\S]*router\.push\('\/ai-coach'\)/);

  assert.match(coach, /\.netlify\/functions\/ai-coach/);
  assert.match(coach, /Authorization:'Bearer '\+session\.access_token/);
  assert.match(coach, /usage\.limit/);
  assert.doesNotMatch(coach, /function ask\(text:string\)/);
});

test("mobile plans show all current and legacy prices, usage and product feature details", () => {
  const plans = read("../AthleteN-Mobile/src/app/plans.tsx");
  const entitlements = read("../AthleteN-Mobile/src/lib/entitlements.ts");

  for (const plan of ["free", "student", "pro", "elite", "coach", "academy"]) {
    assert.ok(plans.includes("PLAN_PRICING." + plan), "Plan price missing from mobile catalogue: " + plan);
  }
  for (const plan of ["free", "student", "pro", "elite", "coach", "academy"]) {
    assert.ok(entitlements.includes(plan + ":"), "AI entitlement missing for plan: " + plan);
  }
  assert.match(plans, /legacy:true/);
  assert.match(plans, /LEGACY · NO NEW SALES/);
  assert.match(plans, /₹\{p\.monthly\.toLocaleString\('en-IN'\)\}\/month/);
  assert.match(plans, /₹\{p\.yearly\.toLocaleString\('en-IN'\)\}\/year/);
  assert.match(plans, /Two included Coach seats/);
  assert.match(plans, /1,000 shared AI Coach requests per month/);
  assert.match(plans, /750 AI Coach requests per month/);
});

test("Coach and Academy role onboarding is admin-reviewed and Academy setup enforces role in the mobile UI", () => {
  const plans = read("../AthleteN-Mobile/src/app/plans.tsx");
  const academy = read("../AthleteN-Mobile/src/app/academy-setup.tsx");
  const roleDraft = read("../supabase/security/role_and_finance_authorization_hardening.sql");
  const policies = read("../supabase/policies.sql");

  assert.match(plans, /REQUEST A COACH \/ ACADEMY ROLE REVIEW/);
  assert.match(plans, /AthleteN Admin must verify and assign the Coach role/);
  assert.match(plans, /request an Academy Admin role through Support Center/);
  assert.match(academy, /const hasAcademyRole = profile\?\.role === 'academy_admin' \|\| profile\?\.role === 'academy'/);
  assert.match(academy, /An approved Academy Admin role is required/);
  assert.match(roleDraft, /REVIEW DRAFT ONLY — NOT A DEPLOYABLE MIGRATION/);
  assert.match(roleDraft, /revoke all on function public\.switch_my_product_role\(text\) from public, anon, authenticated/i);
  const academyInsertPolicy = policies.match(/create policy "academies owner insert"[\\s\\S]*?;/)?.[0] || "";
  assert.match(academyInsertPolicy, /with check \\(\\(select auth\\.uid\\(\\)\\) = owner_user_id\\)/i);
  assert.doesNotMatch(academyInsertPolicy, /profiles[\\s\\S]*role[\\s\\S]*academy_admin/i);
});

test("Account deletion help links to the published request route and does not claim instant deletion", () => {
  const plans = read("../AthleteN-Mobile/src/app/plans.tsx");
  const deletion = read("../public/data-deletion.html");

  assert.match(plans, /data-deletion\.html/);
  assert.match(plans, /verified request, not an instant delete button/);
  assert.match(deletion, /AthleteN Account and Data Deletion/);
  assert.match(deletion, /AthleteN Account and Data Deletion Request/);
  assert.match(deletion, /Do not email your password/);
});
