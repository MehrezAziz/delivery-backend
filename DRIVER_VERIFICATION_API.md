# Driver Verification API (Mobile Integration)

This document defines the production verification flow used during driver registration step 3 and staff review.

## 1) Driver Registration - Step 3

`POST /api/auth/driver/register/step3`  
Auth: `Bearer <driver-access-token>`  
Content-Type: `multipart/form-data`

### Required fields
- `documentType`: `PASSPORT | ID_CARD | STUDENT_CARD`
- `selfieImage`: image file (jpg/png)
- `docImageTop`: image file (jpg/png)

### Optional fields
- `docImageBottom`: image file
- `livenessSession`: JSON string

### `livenessSession` shape (recommended)
```json
{
  "nonce": "1712412123123-abc123xy",
  "timestamp": 1712412123123,
  "passed": true,
  "steps": [
    { "action": "TURN_LEFT", "passed": true, "imageUri": "file://..." },
    { "action": "TURN_RIGHT", "passed": true, "imageUri": "file://..." },
    { "action": "BLINK", "passed": true, "imageUri": "file://..." }
  ],
  "mode": "guided-mobile-capture"
}
```

Notes:
- `nonce` is one-time and replay-protected server-side.
- `timestamp` must be fresh (10 minutes max age).
- Final verdict is **not** returned to driver. Submission stays under staff review.

## 2) Driver In-session Challenge API (optional advanced flow)

### Create challenge
`POST /api/drivers/verification/:documentId/liveness/challenge`  
Auth: `Bearer <driver-access-token>`

Body:
```json
{ "level": "LOW" }
```

Response:
```json
{
  "challengeId": "uuid",
  "documentId": "uuid",
  "actions": ["TURN_LEFT", "BLINK"],
  "expiresAt": "2026-04-06T..."
}
```

### Submit analysis
`POST /api/drivers/verification/:documentId/analyze?challengeId=<id>`  
Auth: `Bearer <driver-access-token>`

Body:
```json
{
  "ocr": { "firstName": "Ali", "lastName": "Ben Ali", "idNumber": "X12345", "dateOfBirth": "1998-01-10" },
  "declared": { "firstName": "Ali", "lastName": "Ben Ali", "idNumber": "X12345", "dateOfBirth": "1998-01-10" },
  "face": { "similarity": 0.74, "confidence": 0.88 },
  "liveness": {
    "passed": true,
    "confidence": 0.93,
    "steps": [{ "action": "TURN_LEFT", "passed": true }, { "action": "BLINK", "passed": true }]
  },
  "rawEngineOutput": {}
}
```

Response contains **recommendation only** for staff traceability.

## 3) Staff Review APIs

### Verification history
`GET /api/staff/drivers/:id/verification-history`  
Auth: staff cookie token

Rules:
- Admin: allowed
- Customer service: requires `VERIFY_ACCOUNTS`

### Final decision
`POST /api/staff/drivers/:id/decision`  
Auth: staff cookie token

Body:
```json
{ "action": "approve", "reason": "" }
```
or
```json
{ "action": "reject", "reason": "Face mismatch and OCR mismatch" }
```

Rules:
- Admin: allowed
- Customer service: requires both `VERIFY_ACCOUNTS` and `UPDATE_DRIVER_STATUS`

Effects:
- updates driver status
- updates verification/doc status
- writes action log
- creates driver notification
- triggers optional webhook (`VERIFICATION_DECISION_WEBHOOK_URL`)

## 4) Operational Env Vars

- `ML_VERIFY_ENABLED=true`
- `OCR_WORKER_URL` (optional external OCR worker)
- `OCR_WORKER_API_KEY` (optional)
- `FACE_WORKER_URL` (optional external face worker)
- `FACE_WORKER_API_KEY` (optional)
- `VERIFICATION_DECISION_WEBHOOK_URL` (in control panel env)

