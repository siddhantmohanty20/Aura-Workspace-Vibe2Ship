# Security Specification & Threat Model

This document outlines the security invariants, threat vector payloads ("Dirty Dozen"), and the validation structure for the Firestore security rules.

## Data Invariants
1. **Authenticated Access**: No user may read, create, update, or delete tasks, goals, or notes unless they are authenticated.
2. **Strict Single-Owner Boundary**: Every document in `tasks`, `goals`, and `notes` must have a `userId` field matching the authenticated user's UID (`request.auth.uid`). No cross-tenant reads or writes are allowed under any circumstances.
3. **Immutability of Owner ID**: Once a document is created, the `userId` field cannot be modified by any update operation, preventing account spoofing.
4. **Validation Integrity**: Incoming fields must conform to standard lengths and formats.

---

## The "Dirty Dozen" Hostile Payloads

### 1. The Anonymous Read
- **Target**: `/tasks/task_1`
- **Context**: Unauthenticated user trying to read a task.
- **Expected Outcome**: `PERMISSION_DENIED`

### 2. The Cross-Tenant Read
- **Target**: `/goals/goal_1` (owned by `user_A`)
- **Context**: Authenticated as `user_B` trying to read `user_A`'s goal.
- **Expected Outcome**: `PERMISSION_DENIED`

### 3. Identity Spoofing (Create)
- **Target**: `/tasks/task_2`
- **Payload**: `{ "userId": "attacker_uid", "title": "Spoofed Task" }`
- **Context**: Authenticated as `victim_uid` trying to create a task under the attacker's UID.
- **Expected Outcome**: `PERMISSION_DENIED`

### 4. Identity Spoofing (Update)
- **Target**: `/tasks/task_3`
- **Payload**: `{ "userId": "victim_uid" }` -> `{ "userId": "attacker_uid" }`
- **Context**: Authenticated as `victim_uid` trying to update the owner of an existing task to an attacker's UID.
- **Expected Outcome**: `PERMISSION_DENIED`

### 5. Collection Scraping (List Queries)
- **Target**: `/notes` (list all notes)
- **Context**: Authenticated as `user_A` executing a query without a `where("userId", "==", request.auth.uid)` clause.
- **Expected Outcome**: `PERMISSION_DENIED`

### 6. Orphaned Goal Attempt
- **Target**: `/goals/goal_4`
- **Payload**: `{ "title": "Goal with no userId" }`
- **Context**: Authenticated user attempting to save a goal without defining the `userId` field.
- **Expected Outcome**: `PERMISSION_DENIED`

### 7. Task Creation with Missing Owner
- **Target**: `/tasks/task_5`
- **Payload**: `{ "title": "Orphaned Task" }`
- **Context**: Authenticated user trying to create a task without a `userId` field.
- **Expected Outcome**: `PERMISSION_DENIED`

### 8. Ghost Field Injection
- **Target**: `/tasks/task_6`
- **Payload**: `{ "userId": "victim_uid", "title": "Task", "isAdmin": true }`
- **Context**: Authenticated user attempting to inject administrative fields or non-existent schema properties.
- **Expected Outcome**: `PERMISSION_DENIED`

### 9. Document ID Poisoning
- **Target**: `/tasks/junk%20characters%20longer%20than%20128%20characters%20attempting%20to%20cause%20denial%20of%20service...`
- **Context**: Injected malicious path variable.
- **Expected Outcome**: `PERMISSION_DENIED`

### 10. Temporal Spoofing
- **Target**: `/notes/note_1`
- **Payload**: `{ "userId": "user_uid", "content": "Note", "created_at": "1999-01-01T00:00:00Z" }`
- **Context**: Overriding standard timestamps with historical values.
- **Expected Outcome**: `PERMISSION_DENIED`

### 11. Sub-Task Cascade Hijacking
- **Target**: `/tasks/task_7` (owned by `user_A`)
- **Context**: Authenticated as `user_B` trying to delete a task linked to `user_A`'s deleted goal.
- **Expected Outcome**: `PERMISSION_DENIED`

### 12. Cross-Tenant Note Manipulation
- **Target**: `/notes/note_2` (owned by `user_A`)
- **Context**: Authenticated as `user_B` trying to update the content of `user_A`'s note.
- **Expected Outcome**: `PERMISSION_DENIED`
