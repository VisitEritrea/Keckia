# Security Specification & Payload TDD (`ai-studio-keckiatravelagen-5f1e2727-50a3-4324-94b6-a7bc83ec498a`)

## 1. Data Invariants
1. Default-deny catch-all at root prevents unauthorized access to any undeclared collection.
2. Only verified authenticated administrators (`email_verified == true` and either listed in `/admins/{uid}` or matching bootstrapped operator `philikesete@gmail.com` / `tours@eritreavisit.com`) or the verified document owner (`ownerUid == request.auth.uid`) can read or write `/ai_accounts/{providerId}` or `/automation_plans/{planId}`.
3. Never store raw API keys or secret tokens in Firestore documents; `hasOnly(...)` strictly rejects any unexpected secret/shadow fields such as `apiKey`, `secret`, or `isAdmin`.
4. All document IDs (`providerId`, `planId`, `uid`) must match `^[a-zA-Z0-9_\-]+$` and be `<= 128` characters.
5. `createdAt` is immutable and must equal `request.time` on `create`; `updatedAt` must equal `request.time` on both `create` and `update`.
6. Once an `automation_plans` record reaches `status == 'completed'`, non-admin updates are blocked (Terminal State Locking).

## 2. "Dirty Dozen" Security Test Payloads (Expected: PERMISSION_DENIED)
1. Unauthenticated read/write to `/ai_accounts/gemini`.
2. Unverified email (`email_verified: false`) pretending to be `philikesete@gmail.com` writing `/ai_accounts/gemini`.
3. Shadow field injection: adding `apiKey: "sk-fake"` or `isAdmin: true` to `/ai_accounts/openai`.
4. Invalid ID poisoning: writing `/ai_accounts/invalid.id.with$chars` or `> 128` chars.
5. Owner UID spoofing: `ownerUid: "someone-else"` on document creation.
6. Changing `ownerUid` or `createdAt` during an `update`.
7. Client-forged timestamps: `createdAt: "2020-01-01T00:00:00Z"` instead of server `request.time`.
8. Non-owner reading another user's `/ai_accounts/{providerId}` document (PII email isolation).
9. Blanket `list` without `resource.data.ownerUid == request.auth.uid` filter for non-admins.
10. String size exhaustion (`workspaceName` > 120 chars).
11. Modifying a terminal `automation_plans` doc (`status == 'completed'`) as non-admin.
12. Self-registering as admin in `/admins/{uid}` by a regular authenticated user.
