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

// Remove the obsolete inline scanner implementations. The standalone component is the
// single source of truth for the scanner UI and prevents duplicate/legacy auth flows.
const legacyWebsiteScanner = /\nfunction TournamentScannerPage\([\s\S]*?(?=\ntype InstagramOrganizerResult =)/;
if (legacyWebsiteScanner.test(source)) {
  source = source.replace(legacyWebsiteScanner, "\n");
}

const legacyInstagramScanner = /\nfunction InstagramOrganizerScanner\([\s\S]*?(?=\nfunction AdminPage\()/;
if (legacyInstagramScanner.test(source)) {
  source = source.replace(legacyInstagramScanner, "\n");
}

const unifiedLine = '  else if (page === "scanner") content = <InstagramOrganizerScanner accessToken={auth.session?.access_token} setToast={setToast} />;';
const scannerRoutePattern = /  else if \(page === "scanner"\) content = .*?;(?=\n  else if \(page === "ai"\))/s;

if (scannerRoutePattern.test(source)) {
  source = source.replace(scannerRoutePattern, unifiedLine);
} else if (!source.includes(unifiedLine)) {
  throw new Error("Scanner route anchor not found; refusing unsafe rewrite");
}

// Keep the scanner reachable when its route is explicitly opened.
const pagePathAnchor = 'function pageFromPath(): PageId {';
const pagePathBlock = /function pageFromPath\(\): PageId \{[\s\S]*?\n\}/;
if (source.includes(pagePathAnchor) && pagePathBlock.test(source)) {
  source = source.replace(pagePathBlock, `function pageFromPath(): PageId {\n  const path = window.location.pathname;\n  if (path === "/admin") return "admin";\n  if (path === "/messages") return "messages";\n  if (path === "/scanner") return "scanner";\n  return "dashboard";\n}`);
}

fs.writeFileSync(path, source);
