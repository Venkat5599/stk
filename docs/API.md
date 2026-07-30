# API

Base: `https://stk-api.187.127.137.136.sslip.io`

Read-only and public. There is no auth, no key, and no rate limit tied to an
identity. `access-control-allow-origin` is `*`, so a browser can call it
directly.

## GET /health

```json
{ "ok": true }
```

## GET /api/programs

| Query | Values | Default |
| --- | --- | --- |
| `window` | `today`, `week`, `month` | `today` |
| `limit` | 1–200 | 50 |

```json
{
  "items": [
    {
      "programId": "Bnfx8N77QEVo9RhJpropL1rLMy6suPXEKMjTBNCnc6Hf",
      "firstSeenAt": "2026-07-30T16:41:19.441Z",
      "deploySlot": 436187460,
      "sizeBytes": 351080,
      "sha256": "f50837e3fab61628b8a90a45f4e0f774eec8a57c6a047d5773de2b732840e3cb",
      "verdict": "new",
      "copyOf": null
    }
  ],
  "total": 16,
  "window": "today"
}
```

`total` counts every row in the window, which may exceed `items.length`.

`firstSeenAt` is when stk first saw the program, not necessarily when it
deployed. The two differ for anything that deployed before the record began.

## GET /api/stats

```json
{
  "window": "today",
  "deploys": 16,
  "copies": 3,
  "fresh": 13,
  "copyRate": 0.1875,
  "recordBeganAt": "2026-07-30T16:39:20.411Z"
}
```

`copyRate` is `null` when nothing has been seen yet — a rate over zero deploys
is undefined, not zero.

`recordBeganAt` is the oldest row held. Anything before it is outside the
record, and a reader should not assume a window is fully covered without
checking this.

## Errors

A failure returns **500** with `{ "error": "internal error" }`. It never returns
an empty list. "Nothing deployed" and "we cannot answer" are different claims
and must not look alike to a caller.
