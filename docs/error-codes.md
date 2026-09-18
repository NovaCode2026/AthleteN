# AthleteN Error Code Standard

Every user-facing failure should use a stable code in the form AREA-NNN. Never expose raw database, provider, stack-trace, token, or secret values.

## Authentication / account
AUTH-001 sign-in failed
AUTH-002 registration failed
AUTH-003 email verification failed
AUTH-004 verification link expired/invalid
AUTH-005 password reset request failed
AUTH-006 password update failed
AUTH-007 Google sign-in failed
AUTH-008 session expired/invalid
AUTH-009 sign-out failed
AUTH-010 account bootstrap failed
AUTH-011 onboarding incomplete
AUTH-012 invalid username
AUTH-013 account age/safety verification required
AUTH-014 parent approval required
AUTH-015 parent approval expired/invalid

## Database / cloud
DATA-001 database read failed
DATA-002 database write failed
DATA-003 database update failed
DATA-004 database delete failed
DATA-005 duplicate record
DATA-006 record not found
DATA-007 permission denied
DATA-008 validation failed
DATA-009 cloud service unavailable
DATA-010 request timed out
DATA-011 stale data/conflict

## Files / documents
FILE-001 upload failed
FILE-002 unsupported file type
FILE-003 file too large
FILE-004 private file access failed
FILE-005 signed download link failed
FILE-006 file delete failed
FILE-007 file not found
FILE-008 storage unavailable
FILE-009 attachment metadata failed

## Messaging / support
MSG-001 message send failed
MSG-002 message load failed
MSG-003 conversation create failed
MSG-004 conversation not found
MSG-005 recipient unavailable
MSG-006 message permission denied
MSG-007 message report failed
MSG-008 message attachment upload failed
MSG-009 message attachment access failed
MSG-010 message attachment too large
MSG-011 unsupported message attachment
MSG-012 realtime connection failed
MSG-013 message search failed

## Instagram / scanner
IG-001 Instagram source invalid
IG-002 Instagram content inaccessible
IG-003 Instagram login required
IG-004 Instagram authorization expired
IG-005 Instagram permission denied
IG-006 Instagram API request failed
IG-007 Instagram rate limit
IG-008 Instagram account not eligible
IG-009 Instagram media unavailable
IG-010 related account unavailable
IG-011 related content unavailable
IG-012 no tournament content found
IG-013 tournament extraction failed
IG-014 source changed
IG-015 scanner temporarily unavailable

## Tournament scanner
SCAN-001 invalid source URL
SCAN-002 unsupported source
SCAN-003 source blocked
SCAN-004 source timed out
SCAN-005 source requires JavaScript/login
SCAN-006 no tournament information found
SCAN-007 tournament name missing
SCAN-008 date missing/unreadable
SCAN-009 venue missing/unreadable
SCAN-010 registration information missing
SCAN-011 category information missing
SCAN-012 source conflict detected
SCAN-013 scan already checked for plan interval
SCAN-014 scan could not be saved
SCAN-015 automatic update check failed
SCAN-016 change detection failed
SCAN-017 source limit reached
SCAN-018 related-source limit reached
SCAN-019 extraction confidence too low

## AI Coach
AI-001 AI service unavailable
AI-002 AI request failed
AI-003 AI usage limit reached
AI-004 AI request validation failed
AI-005 AI response unavailable
AI-006 AI response safety/format validation failed
AI-007 AI timeout

## Payments / plans
PAY-001 checkout could not start
PAY-002 payment provider unavailable
PAY-003 payment cancelled
PAY-004 payment failed
PAY-005 payment status unavailable
PAY-006 webhook processing failed
PAY-007 subscription not found
PAY-008 subscription state invalid
PAY-009 plan entitlement denied
PAY-010 trial unavailable
PAY-011 billing configuration missing

## Training / athlete records
ATH-001 training record invalid
ATH-002 tournament record invalid
ATH-003 medal record invalid
ATH-004 weight record invalid
ATH-005 goal record invalid
ATH-006 checklist record invalid
ATH-007 calendar record invalid
ATH-008 Kyorugi record invalid
ATH-009 Poomsae record invalid
ATH-010 readiness calculation failed
ATH-011 profile data invalid

## Coach / academy
ROLE-001 role not permitted
ROLE-002 athlete roster load failed
ROLE-003 athlete invite failed
ROLE-004 assignment save failed
ROLE-005 coach access denied
ROLE-006 academy access denied
ROLE-007 academy seat limit reached

## Verification / safety
VERIFY-001 verification upload failed
VERIFY-002 verification type missing
VERIFY-003 verification request failed
VERIFY-004 verification request not found
VERIFY-005 verification status update failed
VERIFY-006 verification permission denied

## Admin / platform
ADMIN-001 admin access denied
ADMIN-002 admin data load failed
ADMIN-003 admin action failed
ADMIN-004 report update failed
ADMIN-005 moderation action failed
ADMIN-006 roadmap update failed

## Routing / UI
UI-001 page failed to load
UI-002 invalid route
UI-003 form validation failed
UI-004 action unavailable
UI-005 browser feature unavailable
UI-006 unexpected application error

## Network / configuration
NET-001 network request failed
NET-002 network timeout
NET-003 service unavailable
NET-004 API configuration missing
NET-005 invalid API response

## Support message shown with every error
User-facing error text should be:
“Something went wrong. Error code: CODE. Contact NovaCode at novacode.create@gmail.com, send a message in AthleteN, or use Problem/Feedback. Include this code and what you were doing.”

For security, logs may contain technical diagnostics, but the UI must not show access tokens, database SQL, stack traces, provider secrets, or internal URLs.
