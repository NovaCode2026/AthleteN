# Security Policy

## Scope

AthleteN handles application data that may include athlete profiles, training information, competition records, documents, and account information. Security issues should be treated seriously and reported privately.

## Supported Versions

| Version | Supported |
| --- | --- |
| Main / current release | Yes |

## Reporting a Vulnerability

**Please do not publish security vulnerabilities in public issues, pull requests, discussions, or screenshots.**

Report concerns privately through the repository's configured private security reporting channel or directly to the project maintainers.

Include, where possible:

- A clear description of the issue
- Affected component or route
- Reproduction steps or proof of concept
- Potential impact
- Relevant logs without secrets or personal data
- Suggested mitigation, if known

Do not include real user credentials, API keys, access tokens, private documents, or unnecessary personal information.

## Security Principles

AthleteN follows these principles:

- **Authentication:** user identity is handled through the configured authentication layer.
- **Authorization:** protected data is restricted using application permissions and Supabase Row Level Security where applicable.
- **Secrets:** private credentials remain server-side or in local ignored environment files.
- **AI:** provider secrets are not intended for browser or mobile bundles.
- **Storage:** sensitive athlete documents should use private storage policies.
- **Least privilege:** services should receive only the permissions they require.
- **Validation:** untrusted input should be validated at the appropriate boundary.
- **Logging:** logs should avoid credentials and unnecessary personal information.

## Never Commit

Do not commit:

```text
OPENAI_API_KEY
Supabase service-role keys
database passwords
private access tokens
payment secrets
webhook signing secrets
real user credentials
private athlete documents
```

## Responsible Disclosure

Nova Code will review valid reports, prioritize issues according to severity and impact, and coordinate remediation where appropriate.

Security research must not intentionally access, modify, delete, expose, or disrupt data or systems that you do not own or have explicit permission to test.