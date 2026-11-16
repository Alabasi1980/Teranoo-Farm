# Security Specification — مزرعتي — رحلة الازدهار

## 1. Data Invariants
1. **User Isolation**: Each user can only `get`, `create`, and `update` their own document at `/farms/{userId}` where `request.auth.uid == userId` and `request.auth.token.email_verified == true`.
2. **No Cross-User Enumeration**: `list` and `delete` on `/farms` are explicitly denied (`allow list, delete: if false;`).
3. **Non-Negative Economy & Inventory**: `coins`, `xp`, `seeds.wheat`, `seeds.carrot`, `crops.wheat`, `crops.carrot`, and all `stats.*` counters must be integers `>= 0`.
4. **Strict Plot Shape**: `plots` must be an array of exact length `6` in strict positional order (`plot-1`..`plot-6`), each containing only `id`, `cropId` (`""`, `"wheat"`, `"carrot"`), `plantedAt` (`int >= 0`), and `wateredAt` (`int >= 0`), with valid temporal consistency (`wateredAt == 0 || wateredAt >= plantedAt`).
5. **Immutable Ownership & Timestamps**: `ownerUid`, `schemaVersion`, and `createdAt` cannot change on update; both `createdAt` and `updatedAt` are required Firestore `Timestamp` values (`is timestamp`) written explicitly with every valid payload.
6. **Atomic Revision Progression**: `revision` must be `1` on creation and strictly `existing().revision + 1` on every update.
7. **Zero Shadow Fields**: Exact `keys().hasAll(...) && keys().hasOnly(...)` on root document, `seeds`, `crops`, `stats`, and every plot object.

## 2. Adversarial "Dirty Dozen" Payloads (Expected: PERMISSION_DENIED)
1. **Unauthenticated read/write**: Read or write `/farms/uidA` when `request.auth == null`.
2. **Cross-user read**: Authenticated as `uidB` attempting `get(/farms/uidA)`.
3. **Cross-user write / UID spoofing**: Authenticated as `uidB` attempting `create(/farms/uidA)` or setting `ownerUid: "uidA"`.
4. **Collection list scraping**: Authenticated user attempting `list(/farms)`.
5. **Unverified email**: Authenticated user with `email_verified: false` attempting `create` or `update`.
6. **Negative currency**: Updating `coins: -50`.
7. **Negative seed/crop inventory**: Updating `seeds: { wheat: -1, carrot: 0 }` or `crops: { wheat: 0, carrot: -3 }`.
8. **Shadow/ghost field injection**: Including `isAdmin: true` or `bonus: 9999` on `create` or `update`.
9. **Client-forged timestamp**: Sending a local `Date` for `updatedAt` instead of `serverTimestamp()` (`request.time`).
10. **Revision rollback / stale overwrite**: Updating with `revision: existing.revision` or `revision: existing.revision - 1` instead of `existing.revision + 1`.
11. **Corrupted plot array length or invalid cropId**: Sending 5 plots instead of 6, or `cropId: "gold_tree"`.
12. **Mutating immutable fields**: Attempting to change `ownerUid` or `createdAt` during an `update`.
