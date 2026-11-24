# AthleteN Messaging: E2E Encryption and Encrypted Backup Design

Status: architecture decision and release gate; no cryptographic code is enabled by this document.

## Goals

- Message and attachment content is readable only on devices belonging to conversation members.
- The application backend stores ciphertext and routing metadata, not message plaintext or private keys.
- Direct chats and groups use protocols designed for their respective membership models.
- New devices are explicit cryptographic identities and can be reviewed or revoked.
- Backups are encrypted on the client before upload. The server never receives a backup decryption key.
- Existing age approval, block controls, reports, message expiry and group permissions remain enforceable.

## Protocol decisions

### Direct conversations

Use a maintained, independently reviewed implementation of the Signal Protocol family, including PQXDH for asynchronous session establishment where supported and the Double Ratchet for per-message key evolution. Do not implement X3DH, PQXDH, the Double Ratchet, HKDF, AEAD, signature schemes, or key storage primitives from scratch.

The chosen library must have supported implementations for the actual native and web runtimes, a documented multi-device model, security review history, and a maintained release process. If one approved implementation does not support both web and native clients, use interoperable protocol implementations with shared test vectors and an explicit cross-platform compatibility suite.

### Group conversations

Use the IETF Messaging Layer Security protocol (MLS), specified in RFC 9420, for group key establishment, membership changes, forward secrecy and post-compromise security. A group membership add or removal must produce and distribute an authenticated MLS state transition before subsequent application messages are accepted. A removed member must not be able to decrypt messages from later epochs.

Do not substitute a home-grown sender-key scheme for MLS. Do not expose MLS private state or group secrets to the server.

Reference: https://www.rfc-editor.org/rfc/rfc9420

### Identity and device lifecycle

- Each installation receives a distinct device identity. Private identity and ratchet state remain on that device in platform-protected storage.
- Public device records and signed prekeys may be stored server-side; private keys must never be uploaded.
- Adding a device requires an authenticated, explicit approval from an existing trusted device or a recovery flow that is documented and user-visible.
- Show a device list with last-active metadata and a revoke action. Revocation must rotate direct-session and MLS group state.
- Provide a verification code or QR fingerprint for users who want to verify a contact's identity out of band.
- Session refresh, logout and account switching must clear in-memory decrypted content and prevent one account from reading another account's local message cache.

## Message and attachment data model

The server stores opaque ciphertext, protocol version, conversation identifier, sender device identifier, message ordering metadata, expiry metadata and delivery receipts. It must not store plaintext body text, attachment names that reveal content, file previews, private keys, or unencrypted backup material after E2E rollout.

Attachments are encrypted on the sender's device with a fresh random content key before upload. Ciphertext is stored in the existing private Storage bucket. The content key is wrapped by the active direct-session or MLS application state and delivered inside the encrypted message envelope. Signed Storage URLs expose ciphertext only and remain short-lived.

Message search after E2E rollout must run against locally decrypted content on the device. Do not add server-side plaintext indexing. Search indexes and local caches must be encrypted at rest and scoped to the current device/account.

## Encrypted backup model

Backups are opt-in and use client-side encryption; the ciphertext is uploaded only after local encryption.

1. The client packages message ciphertext, protocol state required for restoration, device metadata and attachment references.
2. Before upload, the client encrypts the backup using an authenticated encryption scheme from the approved crypto library.
3. The backup key is derived locally from a high-entropy recovery secret or user passphrase using a reviewed memory-hard KDF. The server stores only the ciphertext, salt, KDF parameters, algorithm/version identifiers and non-sensitive size/timestamp metadata.
4. The app displays a recovery key or recovery phrase once, explains that losing it means the backup cannot be restored, and never sends it to AthleteN support.
5. A restore decrypts locally, validates the backup authentication tag and protocol version, then re-establishes device sessions. Invalid passwords or corrupted ciphertext must fail closed.
6. Backup deletion removes the server ciphertext and related object references. Backup rotation creates a new encrypted backup before marking the previous backup eligible for deletion.

Do not back up unencrypted private keys, session secrets, plaintext messages, or decrypted attachment files. No server-side recovery bypass or support override is permitted.

## Privacy, moderation and youth-safety constraints

- Message previews remain generic by default on lock screens.
- Reports are explicit user actions. If a user reports an encrypted message, the client must show what selected text, media and surrounding context will be included in the report before submitting it.
- Blocking, age approval, group permissions, expiry, message receipts and membership authorization remain server-enforced using metadata that does not require message plaintext.
- Push payloads contain routing identifiers only; never plaintext content or encryption keys.
- Do not send message or attachment content to ad networks, analytics platforms or AI services by default.

## Rollout gates

E2E encryption is not enabled by the current PR. Before activation, require:

- A selected maintained library and documented supported-platform matrix.
- Independent cryptographic design and implementation review.
- Cross-platform protocol test vectors and interoperability tests.
- Multi-device add/revoke, identity-change, offline delivery, out-of-order delivery and group-membership rotation tests.
- Backup/restore, wrong-key, corruption and key-loss tests.
- Red-team review of local caches, logs, crash reports, notifications and attachment previews.
- A migration plan that clearly labels legacy unencrypted conversations and never silently mixes plaintext and ciphertext.
- Updated privacy notices, age-appropriate disclosures and adult/legal review before public rollout.

No custom cryptography is permitted. Until every gate passes, AthleteN messaging continues to use the existing transport and access-control protections and must not be marketed as end-to-end encrypted.
