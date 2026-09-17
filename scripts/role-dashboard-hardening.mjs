import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const appPath = path.join(root, "src", "App.tsx");
let app = fs.readFileSync(appPath, "utf8");

function replaceOnce(from, to, label) {
  if (!app.includes(from)) throw new Error(`Could not find ${label}`);
  app = app.replace(from, to);
}

if (!app.includes('from "./components/roles/RoleDashboards"')) {
  replaceOnce(
    'import TaekwondoHub from "./components/taekwondo/TaekwondoHub";\n',
    'import TaekwondoHub from "./components/taekwondo/TaekwondoHub";\nimport { CoachDashboard, AcademyDashboard } from "./components/roles/RoleDashboards";\n',
    "TaekwondoHub import"
  );
}

replaceOnce(
  'function Dashboard({ data, usage, openForm }: { data: CloudData; usage: UsageSummary; openForm: (resource: Resource) => void }) { const latestWeight =',
  'function Dashboard({ data, usage, openForm }: { data: CloudData; usage: UsageSummary; openForm: (resource: Resource) => void }) { const role = data.profile.role; const planId = data.profile.plan_id; if (role === "coach" || planId === "champion") return <CoachDashboard profile={data.profile} userId={data.profile.user_id} setToast={() => undefined} />; if (role === "academy_admin" || planId === "academy") return <AcademyDashboard profile={data.profile} userId={data.profile.user_id} setToast={() => undefined} />; const latestWeight =',
  "dashboard role gate"
);

// Give the role dashboards the real toast setter by replacing the dashboard render call.
replaceOnce(
  'else if(page==="dashboard")content=<Dashboard data={data} usage={usage} openForm={openForm}/>;',
  'else if(page==="dashboard") { const role = data.profile.role; const planId = data.profile.plan_id; if(role === "coach" || planId === "champion") content=<CoachDashboard profile={data.profile} userId={userId} setToast={setToast}/>; else if(role === "academy_admin" || planId === "academy") content=<AcademyDashboard profile={data.profile} userId={userId} setToast={setToast}/>; else content=<Dashboard data={data} usage={usage} openForm={openForm}/>; }',
  "role dashboard render"
);

// Hide athlete-only tools from dedicated coach/academy accounts.
replaceOnce(
  'const isAdmin=isAdminProfile(data.profile); const visibleNav=useMemo(()=>nav.filter(([id])=>id!=="admin"||isAdmin),[isAdmin]);',
  'const isAdmin=isAdminProfile(data.profile); const roleWorkspace=data.profile.role === "coach" || data.profile.plan_id === "champion" ? "coach" : data.profile.role === "academy_admin" || data.profile.plan_id === "academy" ? "academy" : "athlete"; const visibleNav=useMemo(()=>{ const base=nav.filter(([id])=>id!=="admin"||isAdmin); if(roleWorkspace==="coach") return base.filter(([id])=>["dashboard","taekwondo","messages","profile","plans"].includes(id)); if(roleWorkspace==="academy") return base.filter(([id])=>["dashboard","taekwondo","messages","profile","plans"].includes(id)); return base; },[isAdmin,roleWorkspace]);',
  "role-specific navigation"
);

// The local Vite server does not host Netlify Functions. Add a dedicated full-stack dev command.
const packagePath = path.join(root, "package.json");
const pkg = JSON.parse(fs.readFileSync(packagePath, "utf8"));
pkg.scripts = pkg.scripts || {};
if (!pkg.scripts["dev:netlify"]) pkg.scripts["dev:netlify"] = "npx netlify-cli dev";
fs.writeFileSync(packagePath, JSON.stringify(pkg, null, 2) + "\n");

fs.writeFileSync(appPath, app);
console.log("Role dashboard hardening applied.");
