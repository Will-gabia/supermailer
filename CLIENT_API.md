# Supermailer Client API Guide

이 문서는 외부 클라이언트가 **send-only Supermailer**와 연동하는 방법을 설명합니다.

핵심 흐름은 아래와 같습니다.

1. API 키 준비
2. callback endpoint 등록(선택)
3. raw EML 발송 등록
4. `updatedSince` 기준으로 결과 polling
5. 필요하면 webhook으로 빠른 상태 알림 수신

> OpenAPI 문서는 [`openapi.yaml`](./openapi.yaml)을 참고하세요.

---

## 1. 기본 개념

- Supermailer는 **수신자/템플릿/캠페인 관리 시스템이 아닙니다**.
- 클라이언트가 준비한 **raw RFC 822 / EML 원문**을 그대로 받아서 발송합니다.
- 결과 동기화의 기준 인터페이스는 **polling API**입니다.
- callback webhook은 **빠른 알림층**입니다. 실시간성은 webhook, 정합성 복구는 polling으로 처리하는 것을 권장합니다.

---

## 2. 인증 방식

외부 API는 모두 `x-api-key` 헤더를 사용합니다.

```bash
export SUPERMAILER_BASE_URL="http://localhost:3000"
export SUPERMAILER_API_KEY="<YOUR_API_KEY>"
```

공통 헤더 예시:

```bash
-H "x-api-key: ${SUPERMAILER_API_KEY}"
-H "content-type: application/json"
```

인증 실패 시 대표 응답:

```json
{
  "code": "api_key_invalid",
  "message": "Valid API key required"
}
```

권한 부족 시 대표 응답:

```json
{
  "code": "api_key_scope_denied",
  "message": "API key lacks individual-send scope"
}
```

---

## 3. Health check

배포 직후 또는 polling 시작 전에 아래로 연결 상태를 확인할 수 있습니다.

```bash
curl -s "${SUPERMAILER_BASE_URL}/api/health"
```

예상 응답:

```json
{
  "service": "management-console",
  "status": "healthy",
  "port": 3000
}
```

---

## 4. Callback endpoint 등록

callback endpoint는 API 키 단위로 사전 등록합니다.

```bash
curl -s "${SUPERMAILER_BASE_URL}/api/callback-endpoints" \
  -X POST \
  -H "x-api-key: ${SUPERMAILER_API_KEY}" \
  -H "content-type: application/json" \
  -d '{
    "label": "ops-webhook",
    "targetUrl": "https://client.example.com/webhooks/send-results"
  }'
```

예상 응답:

```json
{
  "data": {
    "id": "01HQABCDEFG1234567890XYZ12",
    "label": "ops-webhook",
    "targetUrl": "https://client.example.com/webhooks/send-results",
    "isActive": true,
    "createdAt": "2026-03-23T09:00:00.000Z",
    "updatedAt": "2026-03-23T09:00:00.000Z"
  }
}
```

유효성 검사 실패 예시:

```json
{
  "code": "validation_error",
  "message": "label and targetUrl are required"
}
```

---

## 5. Callback endpoint 목록 조회

```bash
curl -s "${SUPERMAILER_BASE_URL}/api/callback-endpoints" \
  -H "x-api-key: ${SUPERMAILER_API_KEY}"
```

예상 응답:

```json
{
  "data": [
    {
      "id": "01HQABCDEFG1234567890XYZ12",
      "label": "ops-webhook",
      "targetUrl": "https://client.example.com/webhooks/send-results",
      "isActive": true,
      "createdAt": "2026-03-23T09:00:00.000Z",
      "updatedAt": "2026-03-23T09:00:00.000Z"
    }
  ]
}
```

---

## 6. 발송 등록

Supermailer는 raw EML 원문을 직접 받습니다.

### 6-1. callback 없이 발송

```bash
curl -s "${SUPERMAILER_BASE_URL}/api/sends" \
  -X POST \
  -H "x-api-key: ${SUPERMAILER_API_KEY}" \
  -H "content-type: application/json" \
  -d '{
    "eml": "From: sender@example.com\r\nTo: alice@example.com\r\nSubject: Hello from Supermailer\r\nMIME-Version: 1.0\r\nContent-Type: text/plain; charset=utf-8\r\n\r\nHello from Supermailer"
  }'
```

### 6-2. callback endpoint를 연결해서 발송

```bash
curl -s "${SUPERMAILER_BASE_URL}/api/sends" \
  -X POST \
  -H "x-api-key: ${SUPERMAILER_API_KEY}" \
  -H "content-type: application/json" \
  -d '{
    "eml": "From: sender@example.com\r\nTo: alice@example.com\r\nSubject: Hello from Supermailer\r\nMIME-Version: 1.0\r\nContent-Type: text/plain; charset=utf-8\r\n\r\nHello from Supermailer",
    "callbackEndpointId": "01HQABCDEFG1234567890XYZ12"
  }'
```

예상 응답:

```json
{
  "status": "queued",
  "scope": "send",
  "sendId": "01HQSENDABCDEFG1234567890XY",
  "queueJobId": "send-01HQSENDABCDEFG1234567890XY",
  "recipient": "alice@example.com",
  "callbackEndpointId": "01HQABCDEFG1234567890XYZ12"
}
```

유효성 검사 실패 예시:

```json
{
  "code": "validation_error",
  "message": "eml is required"
}
```

잘못된 callback endpoint ID 예시:

```json
{
  "code": "validation_error",
  "message": "callbackEndpointId is invalid"
}
```

---

## 7. 결과 polling

이 API가 **정합성 기준**입니다.

```bash
curl -s "${SUPERMAILER_BASE_URL}/api/send-results?updatedSince=2026-03-23T00:00:00.000Z&limit=100" \
  -H "x-api-key: ${SUPERMAILER_API_KEY}"
```

예상 응답:

```json
{
  "data": [
    {
      "sendId": "01HQSENDABCDEFG1234567890XY",
      "kind": "individual",
      "recipientEmail": "alice@example.com",
      "status": "queued",
      "callbackEndpointId": "01HQABCDEFG1234567890XYZ12",
      "updatedAt": "2026-03-23T09:05:00.000Z"
    }
  ]
}
```

`status` 값은 현재 아래 상태 집합 중 하나입니다.

- `queued`
- `dispatching`
- `accepted_by_mta`
- `delivered`
- `bounced`
- `failed_transient`
- `failed_permanent`
- `deferred`

잘못된 timestamp 예시:

```json
{
  "code": "validation_error",
  "message": "updatedSince must be a valid ISO date"
}
```

### 권장 polling 전략

- 저장된 마지막 `updatedAt`를 기준으로 다음 polling을 수행합니다.
- 운영에서는 시계 오차나 커밋 지연을 감안해 **몇 초 정도 lookback**을 두는 것이 안전합니다.
- webhook을 쓰더라도 polling은 주기적으로 계속 돌려서 누락/실패를 복구하는 것이 좋습니다.

---

## 8. Webhook 수신 가이드

callback endpoint를 연결한 발송이 최종 상태에 도달하면 Supermailer가 수신 서버로 POST를 보냅니다.

현재 webhook은 **individual send**에 대해서만 전송됩니다.

### 8-1. 헤더

- `content-type: application/json`
- `x-supermailer-signature: <hex hmac>`

### 8-2. 예시 payload

```json
{
  "eventType": "send.status_changed",
  "sendId": "01HQSENDABCDEFG1234567890XY",
  "sendKind": "individual",
  "status": "delivered",
  "resultCode": "delivered",
  "recipientEmail": "alice@example.com",
  "occurredAt": "2026-03-23T09:10:00.000Z",
  "event": {
    "id": "01HQEVENTABCDEFG1234567890X",
    "sendId": "01HQSENDABCDEFG1234567890XY",
    "type": "delivered",
    "occurredAt": "2026-03-23T09:10:00.000Z",
    "providerEventId": "evt-result-001",
    "smtpReplyCode": "250",
    "smtpEnhancedCode": "2.0.0",
    "reason": "Delivered",
    "relay": "relay.internal",
    "postfixQueueId": "QID-12345",
    "provenance": "normalized/internal"
  }
}
```

### 8-3. 서명 검증 원칙

- raw request body 그대로 사용
- `x-supermailer-signature` 헤더를 읽음
- callback endpoint에 연결된 signing secret으로 HMAC-SHA256 계산
- 상수 시간 비교 사용

Node.js 예시:

```js
import crypto from 'node:crypto';

function sign(secret, rawBody) {
  return crypto
    .createHmac('sha256', `outbound-result-webhook:${secret}`)
    .update(rawBody)
    .digest('hex');
}

function verifySignature(secret, rawBody, receivedSignature) {
  const expected = sign(secret, rawBody);
  const left = Buffer.from(expected);
  const right = Buffer.from(receivedSignature || '');

  if (left.length !== right.length) {
    return false;
  }

  return crypto.timingSafeEqual(left, right);
}
```

### 8-4. 운영 팁

- webhook endpoint는 200 또는 202를 빠르게 반환하세요.
- 긴 후속 처리는 큐/비동기 작업으로 넘기는 것이 좋습니다.
- webhook 중복 수신 가능성을 가정하고 `sendId` 기반 idempotent 처리를 권장합니다.

---

## 9. 추천 연동 순서

1. API 키 발급
2. Health check
3. callback endpoint 등록
4. 발송 등록
5. webhook 수신
6. `send-results` polling으로 최종 정합성 확인

---

## 10. 빠른 테스트 시나리오

```bash
export SUPERMAILER_BASE_URL="http://localhost:3000"
export SUPERMAILER_API_KEY="<YOUR_API_KEY>"

curl -s "${SUPERMAILER_BASE_URL}/api/callback-endpoints" \
  -X POST \
  -H "x-api-key: ${SUPERMAILER_API_KEY}" \
  -H "content-type: application/json" \
  -d '{
    "label": "ops-webhook",
    "targetUrl": "https://client.example.com/webhooks/send-results"
  }'

curl -s "${SUPERMAILER_BASE_URL}/api/sends" \
  -X POST \
  -H "x-api-key: ${SUPERMAILER_API_KEY}" \
  -H "content-type: application/json" \
  -d '{
    "eml": "From: sender@example.com\r\nTo: alice@example.com\r\nSubject: Hello from Supermailer\r\nMIME-Version: 1.0\r\nContent-Type: text/plain; charset=utf-8\r\n\r\nHello from Supermailer"
  }'

curl -s "${SUPERMAILER_BASE_URL}/api/send-results?updatedSince=2026-03-23T00:00:00.000Z&limit=100" \
  -H "x-api-key: ${SUPERMAILER_API_KEY}"
```

---

## 11. 관련 문서

- OpenAPI 문서: [`openapi.yaml`](./openapi.yaml)
- 프로젝트 개요: [`README.md`](./README.md)
- 로컬 설치/검증: [`INSTALL.md`](./INSTALL.md)
- 운영/배포: [`OPERATIONS.md`](./OPERATIONS.md)
