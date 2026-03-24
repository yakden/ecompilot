# EcomPilot PL -- GDPR Privacy API Specification

**Version:** 1.0.0
**Status:** Production
**Base URL:** `https://api.ecompilot.com/api/v1/privacy`
**Auth:** Bearer JWT (requires authenticated user session)

---

## Overview

This API implements the data subject rights mandated by the EU General Data Protection Regulation (GDPR), specifically:

| Right | Article | Endpoint |
|---|---|---|
| Right of access / data portability | Art. 15 / Art. 20 | `GET /export-data` |
| Right to erasure ("right to be forgotten") | Art. 17 | `DELETE /delete-account` |
| Consent management | Art. 7 | `POST /consent`, `GET /consent` |

All endpoints are rate-limited to **5 requests per hour per user** to prevent abuse while remaining compliant with the GDPR requirement to respond within 30 days.

---

## Authentication

All endpoints require a valid JWT in the `Authorization` header:

```
Authorization: Bearer <jwt_token>
```

The JWT must contain:
- `sub` (user ID)
- `email` (verified email address)
- `iat` / `exp` (issued-at / expiry)

---

## Endpoints

### 1. Export User Data

```
GET /api/v1/privacy/export-data
```

Returns a ZIP archive containing all personal data associated with the authenticated user, formatted for machine readability (JSON) per Art. 20 (data portability).

#### Headers

| Header | Value |
|---|---|
| `Authorization` | `Bearer <jwt>` |
| `Accept` | `application/zip` |

#### Query Parameters

| Parameter | Type | Required | Description |
|---|---|---|---|
| `format` | `string` | No | Response format: `zip` (default), `json` (single JSON document) |

#### Response: 202 Accepted

The export is processed asynchronously. The response includes a job ID that can be polled or a download link will be sent via email.

```json
{
  "status": "accepted",
  "jobId": "exp_01HYZ3KXQR9M2WVBN5T8E6P4GC",
  "estimatedCompletionMinutes": 15,
  "notificationEmail": "user@example.com",
  "message": "Your data export has been queued. You will receive a download link at your registered email address."
}
```

#### Response: 200 OK (when format=json and data is small)

```json
{
  "exportedAt": "2026-03-21T14:30:00Z",
  "dataSubject": {
    "userId": "usr_01HYZ3KXQR9M2WVBN5T8E6P4GC",
    "email": "user@example.com",
    "fullName": "Jan Kowalski",
    "phoneNumber": "+48123456789",
    "createdAt": "2024-06-15T10:00:00Z"
  },
  "profile": {
    "companyName": "Kowalski Sp. z o.o.",
    "nip": "1234567890",
    "address": {
      "street": "ul. Marszalkowska 1",
      "city": "Warszawa",
      "postalCode": "00-001",
      "country": "PL"
    },
    "subscription": {
      "plan": "professional",
      "startDate": "2024-06-15",
      "status": "active"
    }
  },
  "marketplaceAccounts": [
    {
      "platform": "allegro",
      "accountId": "alg_123456",
      "connectedAt": "2024-07-01T10:00:00Z",
      "listingsCount": 247
    }
  ],
  "orders": [
    {
      "orderId": "ord_abc123",
      "platform": "allegro",
      "createdAt": "2025-01-15T08:30:00Z",
      "totalAmount": "149.99",
      "currency": "PLN",
      "buyerPii": "[encrypted — included in export]"
    }
  ],
  "billingHistory": [
    {
      "invoiceId": "inv_xyz789",
      "date": "2025-02-01",
      "amount": "199.00",
      "currency": "PLN",
      "status": "paid"
    }
  ],
  "communityPosts": [
    {
      "postId": "post_001",
      "content": "Post content here...",
      "createdAt": "2025-03-01T12:00:00Z"
    }
  ],
  "aiInteractions": [
    {
      "sessionId": "ai_sess_001",
      "query": "How to optimize Allegro listing?",
      "timestamp": "2025-03-10T09:00:00Z"
    }
  ],
  "consentHistory": [
    {
      "consentType": "marketing_email",
      "granted": true,
      "timestamp": "2024-06-15T10:00:00Z",
      "ipAddress": "redacted"
    }
  ],
  "loginHistory": [
    {
      "timestamp": "2026-03-20T08:00:00Z",
      "ipAddress": "redacted",
      "userAgent": "Mozilla/5.0..."
    }
  ]
}
```

#### ZIP Archive Structure

```
ecompilot-data-export-2026-03-21/
  manifest.json           # Export metadata and file listing
  profile.json            # User profile and company data
  marketplace-accounts.json
  orders.json             # All orders with decrypted buyer PII
  billing-history.json    # Invoices and payment history
  community-posts.json    # Forum posts and comments
  ai-interactions.json    # AI assistant conversation history
  consent-history.json    # Full consent audit trail
  login-history.json      # Authentication events
  uploaded-files/         # User-uploaded product images, documents
```

#### Error Responses

| Status | Description |
|---|---|
| 401 | Missing or invalid JWT |
| 429 | Rate limit exceeded (max 5 per hour) |
| 500 | Internal error (the user should retry; logged for investigation) |

---

### 2. Delete Account

```
DELETE /api/v1/privacy/delete-account
```

Permanently deletes the user account and all associated personal data. This action is **irreversible**.

#### Headers

| Header | Value |
|---|---|
| `Authorization` | `Bearer <jwt>` |
| `Content-Type` | `application/json` |

#### Request Body

```json
{
  "confirmation": "DELETE MY ACCOUNT",
  "reason": "no_longer_needed",
  "feedback": "Optional free-text feedback about why they are leaving."
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `confirmation` | `string` | Yes | Must be exactly `"DELETE MY ACCOUNT"` to prevent accidental deletion |
| `reason` | `string` | Yes | One of: `no_longer_needed`, `privacy_concern`, `too_expensive`, `switching_provider`, `other` |
| `feedback` | `string` | No | Optional freeform feedback (max 2000 chars) |

#### Deletion Cascade

The following data is **hard-deleted** (not soft-deleted):

1. **auth-service**: User credentials, sessions, refresh tokens, MFA seeds
2. **billing-service**: Stripe customer link removed, invoices anonymised (retained for tax law: 5 years in Poland per Ordynacja podatkowa)
3. **marketplace-hub**: Marketplace OAuth tokens, listing drafts; sold order records anonymised (retained for consumer protection: 2 years)
4. **ai-service**: Conversation history, embeddings, personalisation vectors
5. **community-service**: Posts anonymised (author set to "Deleted User"), DMs deleted
6. **analytics-service**: User-level analytics purged; aggregated metrics retained (no PII)
7. **notification-service**: Notification history, email templates with user data
8. **content-service**: Uploaded files, product descriptions
9. **academy-service**: Course progress, certificates (offered as download before deletion)
10. **ksef-service**: E-invoice data anonymised (retained per Polish fiscal law: 5 years)
11. **legal-service**: Consent records retained for proof of compliance (Art. 7(1) GDPR)
12. **logistics-engine**: Shipping labels, address book entries
13. **suppliers-service**: Supplier contacts linked to this user
14. **calc-service**: Saved calculations, pricing rules
15. **payment-reconciliation**: Reconciliation records anonymised
16. **notification-service**: Push tokens, notification preferences

#### Response: 202 Accepted

```json
{
  "status": "accepted",
  "deletionJobId": "del_01HYZ3KXQR9M2WVBN5T8E6P4GC",
  "scheduledAt": "2026-03-21T15:00:00Z",
  "graceperiodEnds": "2026-04-04T15:00:00Z",
  "message": "Your account deletion has been scheduled. You have 14 days to cancel this request by logging in. After the grace period, all data will be permanently deleted."
}
```

#### Grace Period

- **14-day grace period** before irreversible deletion begins.
- User can cancel by logging in during the grace period.
- A confirmation email is sent immediately.
- A reminder email is sent 48 hours before final deletion.

#### Legal Retention

Some data is **anonymised rather than deleted** to comply with Polish and EU law:

| Data | Retention Period | Legal Basis |
|---|---|---|
| Tax invoices | 5 years | Ordynacja podatkowa Art. 86 |
| E-invoices (KSeF) | 5 years | Ustawa o VAT Art. 112 |
| Consumer sale records | 2 years | Kodeks cywilny Art. 568 (warranty) |
| Consent audit trail | Indefinite | GDPR Art. 7(1) — proof of consent |

#### Error Responses

| Status | Description |
|---|---|
| 400 | Confirmation string does not match |
| 401 | Missing or invalid JWT |
| 409 | Deletion already in progress |
| 429 | Rate limit exceeded |

---

### 3. Save Consent Preferences

```
POST /api/v1/privacy/consent
```

Records the user's consent choices. Each consent change creates an immutable audit record.

#### Headers

| Header | Value |
|---|---|
| `Authorization` | `Bearer <jwt>` |
| `Content-Type` | `application/json` |

#### Request Body

```json
{
  "consents": [
    {
      "type": "marketing_email",
      "granted": true
    },
    {
      "type": "marketing_sms",
      "granted": false
    },
    {
      "type": "analytics_tracking",
      "granted": true
    },
    {
      "type": "ai_training",
      "granted": false
    },
    {
      "type": "third_party_sharing",
      "granted": false
    }
  ]
}
```

#### Consent Types

| Type | Description | Default |
|---|---|---|
| `marketing_email` | Promotional emails and newsletters | `false` |
| `marketing_sms` | SMS marketing messages | `false` |
| `analytics_tracking` | Behavioural analytics beyond essential service metrics | `false` |
| `ai_training` | Allow anonymised data to improve AI models | `false` |
| `third_party_sharing` | Share data with third-party partners | `false` |
| `essential_cookies` | Required for service operation (cannot be refused) | `true` (immutable) |
| `functional_cookies` | Remember preferences and settings | `false` |

#### Response: 200 OK

```json
{
  "status": "updated",
  "updatedAt": "2026-03-21T14:30:00Z",
  "consents": [
    {
      "type": "marketing_email",
      "granted": true,
      "updatedAt": "2026-03-21T14:30:00Z",
      "auditId": "cns_01HYZ3KXQR9M2WVBN5T8E6P4GC"
    },
    {
      "type": "marketing_sms",
      "granted": false,
      "updatedAt": "2026-03-21T14:30:00Z",
      "auditId": "cns_02HYZ3KXQR9M2WVBN5T8E6P4GC"
    },
    {
      "type": "analytics_tracking",
      "granted": true,
      "updatedAt": "2026-03-21T14:30:00Z",
      "auditId": "cns_03HYZ3KXQR9M2WVBN5T8E6P4GC"
    },
    {
      "type": "ai_training",
      "granted": false,
      "updatedAt": "2026-03-21T14:30:00Z",
      "auditId": "cns_04HYZ3KXQR9M2WVBN5T8E6P4GC"
    },
    {
      "type": "third_party_sharing",
      "granted": false,
      "updatedAt": "2026-03-21T14:30:00Z",
      "auditId": "cns_05HYZ3KXQR9M2WVBN5T8E6P4GC"
    }
  ]
}
```

#### Error Responses

| Status | Description |
|---|---|
| 400 | Invalid consent type or malformed body |
| 401 | Missing or invalid JWT |
| 422 | Attempted to modify `essential_cookies` consent |
| 429 | Rate limit exceeded |

---

### 4. Get Current Consent Settings

```
GET /api/v1/privacy/consent
```

Returns the user's current consent preferences along with timestamps for when each was last modified.

#### Headers

| Header | Value |
|---|---|
| `Authorization` | `Bearer <jwt>` |

#### Response: 200 OK

```json
{
  "userId": "usr_01HYZ3KXQR9M2WVBN5T8E6P4GC",
  "consents": [
    {
      "type": "essential_cookies",
      "granted": true,
      "updatedAt": "2024-06-15T10:00:00Z",
      "immutable": true,
      "description": "Required for the service to function. Cannot be disabled."
    },
    {
      "type": "marketing_email",
      "granted": true,
      "updatedAt": "2026-03-21T14:30:00Z",
      "description": "Receive promotional emails and product newsletters."
    },
    {
      "type": "marketing_sms",
      "granted": false,
      "updatedAt": "2026-03-21T14:30:00Z",
      "description": "Receive promotional SMS messages."
    },
    {
      "type": "analytics_tracking",
      "granted": true,
      "updatedAt": "2026-03-21T14:30:00Z",
      "description": "Allow behavioural analytics to improve your experience."
    },
    {
      "type": "ai_training",
      "granted": false,
      "updatedAt": "2026-01-10T09:00:00Z",
      "description": "Allow anonymised usage data to improve AI recommendation models."
    },
    {
      "type": "third_party_sharing",
      "granted": false,
      "updatedAt": "2024-06-15T10:00:00Z",
      "description": "Share data with selected third-party partners for co-marketing."
    },
    {
      "type": "functional_cookies",
      "granted": false,
      "updatedAt": "2024-06-15T10:00:00Z",
      "description": "Remember your preferences and interface settings across sessions."
    }
  ],
  "privacyPolicyVersion": "2.1.0",
  "privacyPolicyAcceptedAt": "2025-09-01T08:00:00Z",
  "dataProcessingAgreementVersion": "1.3.0"
}
```

#### Error Responses

| Status | Description |
|---|---|
| 401 | Missing or invalid JWT |
| 404 | User not found |

---

## Data Processing Architecture

### Encryption at Rest

All PII fields are encrypted using AES-256-GCM via `@ecompilot/shared-security/encryption`:
- Email addresses
- Phone numbers
- Physical addresses
- NIP (Polish tax ID) / PESEL (Polish personal ID)
- Marketplace OAuth access tokens and refresh tokens
- Payment method references

### Audit Trail

Every consent change and data access event is recorded in an append-only audit log:

```json
{
  "auditId": "aud_01HYZ3KXQR9M2WVBN5T8E6P4GC",
  "action": "consent_updated",
  "userId": "usr_01HYZ3KXQR9M2WVBN5T8E6P4GC",
  "timestamp": "2026-03-21T14:30:00Z",
  "details": {
    "consentType": "marketing_email",
    "previousValue": false,
    "newValue": true
  },
  "ipAddress": "hashed",
  "userAgent": "hashed"
}
```

### Cross-Service Deletion Flow

Account deletion is orchestrated via the event bus (NATS JetStream):

1. `auth-service` publishes `user.deletion.requested` event
2. Each service subscribes and deletes/anonymises its data
3. Each service publishes `user.deletion.completed.{service}` acknowledgement
4. `auth-service` waits for all 16 acknowledgements (timeout: 24 hours)
5. On full acknowledgement: final auth record deletion
6. On partial acknowledgement: alert security team for manual review

### Compliance Monitoring

- Automated weekly check that no PII exists for deleted users (reconciliation job)
- Monthly GDPR compliance report generated for the DPO (Data Protection Officer)
- Annual third-party penetration test covering the privacy API endpoints
- All privacy API calls logged separately for regulatory audit (retained 3 years)

---

## Rate Limits

| Endpoint | Limit | Window |
|---|---|---|
| `GET /export-data` | 5 | 1 hour |
| `DELETE /delete-account` | 3 | 24 hours |
| `POST /consent` | 20 | 1 hour |
| `GET /consent` | 60 | 1 hour |

---

## Contact

- **Data Protection Officer:** dpo@ecompilot.com
- **Privacy inquiries:** privacy@ecompilot.com
- **Supervisory authority:** UODO (Urzad Ochrony Danych Osobowych), ul. Stawki 2, 00-193 Warszawa
