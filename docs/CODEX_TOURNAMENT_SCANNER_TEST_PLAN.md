# AthleteN Tournament Scanner — Codex Test Plan

## Goal
Verify the Tournament Scanner is production-safe for tournament evidence extraction, Reel evidence, smart merge review, manual merge, and tournament groups.

## Test rules
- Do not invent facts when evidence is missing.
- Do not turn OCR noise into a structured fact.
- Do not treat reporting/check-in/weigh-in dates as tournament dates.
- Preserve conflicts instead of silently choosing between materially different values.
- Never auto-merge scans. A user action is required.
- A dismissed merge suggestion must remain separate.
- Merged evidence must retain source URLs and provenance.
- Tournament groups must keep individual scans; grouping must not delete scans.

## Required regression sources
1. Instagram post: https://www.instagram.com/p/DdRa9kuhtSL/
2. Instagram post: https://www.instagram.com/p/DdFtaQTzptv/
3. Instagram source/reel test used during scanner development: https://www.instagram.com/p/Ddfk8B1hx7F/

## Functional tests

### A. Instagram source intake
- Accept /p/<id>/ URLs.
- Accept /reel/<id>/ URLs.
- Accept /reels/<id>/ URLs.
- Reject non-Instagram URLs in Instagram mode.
- Scan without a separate organizer-account input.
- Confirm related accessible tournament accounts/posts are filtered for relevance.

### B. Poster intelligence
- Extract tournament title from multi-line poster layouts.
- Extract event date independently from reporting/check-in date.
- Extract venue/city/state only when supported by accessible poster evidence.
- Extract sport, discipline, events/divisions, age and weight categories when readable.
- Extract registration, fees, contacts, notices, scoring/equipment and prizes when readable.
- Omit unsupported fields from the main intelligence result.
- Keep raw OCR separate from structured facts.

### C. Reel intelligence
- Detect accessible Reel video evidence when Instagram exposes it.
- Use an accessible transcript/caption only when actually present.
- Never claim spoken audio was transcribed when no transcript is exposed.
- Keep source-level date evidence separate from poster date evidence.
- If a Reel has no accessible transcript, do not invent one.

### D. Smart merge suggestions
Create two or more scans for the same tournament and verify:
- A suggestion appears when multiple evidence anchors match.
- Suggestion explains matching evidence: name/date/venue/organizer/sport/city.
- Suggestion displays the source URLs.
- No suggestion is created for unrelated tournaments with weak evidence.
- Suggestions never trigger an automatic merge.
- "Review merge" only selects the scans for user confirmation.
- "Keep separate" removes that suggestion from the current review list.

### E. Manual merge
- Select two matching scans and merge.
- Reject a merge when evidence is insufficient.
- Preserve conflicts as conflicts.
- Equivalent OCR variants such as abbreviated/full venue names must not become false conflicts.
- Preserve source URLs and merged scan IDs.
- Confirm duplicate source rows are removed only after a successful merge.

### F. Tournament groups
- Select two or more scans and create a named group.
- Verify every member keeps its original scan/source.
- Verify the group name and group ID appear in each member's details.
- Verify group creation does not merge or delete scans.
- Verify scans in the same group stop producing duplicate pair suggestions for each other.
- Create another group from unrelated scans and verify it remains independent.

### G. Regression / safety
- Existing saved scans still load.
- Empty/missing optional fields do not render placeholder values such as "none", "N/A", or "not found".
- Authenticated user can access only their own scans.
- Unauthenticated scanner actions are rejected.
- Merge/group actions reject IDs that do not belong to the current user.
- Build/typecheck/lint must pass.
- No new console errors during scanner use.

## Acceptance
Codex should report PASS/FAIL for every section, include failing test names and exact errors, then fix failures and rerun the affected tests. Do not mark the scanner production-ready until all required regression and functional tests pass.
