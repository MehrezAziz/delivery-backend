# Delivery Company API

Base URL: `https://<your-domain>/api/v1/company`

Auth header:

```http
Authorization: Bearer <delivery_company_api_key>
```

## Main endpoints

- `GET /profile`
- `POST /departments`
- `GET /orders`
- `POST /orders/preview`
- `POST /orders`
- `GET /wallet`
- `GET /wallet/transactions`
- `POST /refund-requests`
- `GET /refund-requests`
- `GET /stats?from=2026-01-01&to=2026-01-31`

## Formal API artifacts

- OpenAPI spec: `docs/delivery-company-openapi.yaml`
- Postman collection: `docs/delivery-company-postman.collection.json`

## Business constraints

- Company orders are wallet-only (coins).
- COD is forbidden.
- Reserve policy requires order amount + 50% return capacity.
- Return flow statuses: `RETURNED` then `RETURN_DEPOSIT`.
- Company can submit `POST /orders/:id/return-deposit-feedback` on order API.
- API key scopes are enforced per endpoint group (`orders:*`, `wallet:read`, `refunds:*`, `departments:*`).
- API keys are rate-limited per key window to reduce abuse.

## JavaScript (fetch)

```javascript
const API_KEY = process.env.DELIVERY_COMPANY_API_KEY;
const base = "https://api.example.com/api/v1/company";

const res = await fetch(`${base}/orders`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${API_KEY}`,
  },
  body: JSON.stringify({
    pickupAddressId: "uuid-1",
    dropoffAddressId: "uuid-2",
    weight: 3,
    description: "Fragile package",
  }),
});
```

## Python (requests)

```python
import requests

base = "https://api.example.com/api/v1/company"
headers = {"Authorization": "Bearer <API_KEY>"}
payload = {
  "pickupAddressId": "uuid-1",
  "dropoffAddressId": "uuid-2",
  "weight": 2.5,
}
r = requests.post(f"{base}/orders", json=payload, headers=headers, timeout=20)
print(r.status_code, r.json())
```

## PHP (Guzzle)

```php
<?php
$client = new \GuzzleHttp\Client([
  "base_uri" => "https://api.example.com/api/v1/company/",
  "headers" => ["Authorization" => "Bearer <API_KEY>"],
]);

$response = $client->post("orders", [
  "json" => [
    "pickupAddressId" => "uuid-1",
    "dropoffAddressId" => "uuid-2",
    "weight" => 1.2
  ]
]);
echo $response->getBody();
```

## Java (OkHttp)

```java
OkHttpClient client = new OkHttpClient();
RequestBody body = RequestBody.create(
  "{\"pickupAddressId\":\"uuid-1\",\"dropoffAddressId\":\"uuid-2\",\"weight\":1.5}",
  MediaType.get("application/json")
);
Request request = new Request.Builder()
  .url("https://api.example.com/api/v1/company/orders")
  .addHeader("Authorization", "Bearer <API_KEY>")
  .post(body)
  .build();
Response response = client.newCall(request).execute();
```

## C# (HttpClient)

```csharp
var client = new HttpClient();
client.DefaultRequestHeaders.Authorization =
    new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", "<API_KEY>");

var json = "{\"pickupAddressId\":\"uuid-1\",\"dropoffAddressId\":\"uuid-2\",\"weight\":4}";
var resp = await client.PostAsync(
    "https://api.example.com/api/v1/company/orders",
    new StringContent(json, Encoding.UTF8, "application/json")
);
Console.WriteLine(await resp.Content.ReadAsStringAsync());
```
