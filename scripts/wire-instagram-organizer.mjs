import fs from "node:fs";

const path = "src/App.tsx";
let source = fs.readFileSync(path, "utf8");

const importLine = 'import InstagramOrganizerScanner from "./components/instagram/InstagramOrganizerScanner";';
if (!source.includes(importLine)) {
  const anchor = source.includes('import MessagingPage from "./components/messaging/MessagingPage";')
    ? 'import MessagingPage from "./components/messaging/MessagingPage";'
    : 'import AdminControlCenter from "./components/admin/AdminControlCenter";';
  if (!source.includes(anchor)) throw new Error("Safe import anchor not found");
  source = source.replace(anchor, `${anchor}\n${importLine}`);
}

const unifiedLine = '  else if (page === "scanner") content = <InstagramOrganizerScanner accessToken={auth.session?.access_token} setToast={setToast} />;';
const scannerRoutePattern = /  else if \(page === "scanner"\) content = .*?;(?=\n  else if \(page === "ai"\))/s;

if (scannerRoutePattern.test(source)) {
  source = source.replace(scannerRoutePattern, unifiedLine);
} else if (!source.includes(unifiedLine)) {
  throw new Error("Scanner route anchor not found; refusing unsafe rewrite");
}

fs.writeFileSync(path, source);
