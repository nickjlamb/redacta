# Redacta gateway service

The Redacta privacy boundary as a self-hosted HTTP service: pseudonymise
patient identifiers and PII **inside your own infrastructure** before text
reaches an LLM or any other external service. A thin wrapper (zero runtime
dependencies beyond the engine) over
[`PrivacyGateway`](../GATEWAY.md) from
[`@pharmatools/redacta`](https://www.npmjs.com/package/@pharmatools/redacta) —
no boundary logic lives here.

**Why this exists.** The MCP server puts the privacy boundary beside one
desktop agent. This service puts the same boundary beside *applications*: a
hospital or pharma team runs it in their own cluster or VPC, their apps call
it over the internal network, and raw identifiers never leave their
environment. It is self-hosted only — there is no hosted Redacta, because PHI
transiting a third party would defeat the point.

## API

All endpoints take and return JSON. If a `REDACTA_API_TOKEN` is configured,
every `/v1/*` request needs `Authorization: Bearer <token>`.

### Stateless (always on — safe with any number of replicas)

| Endpoint | Body | Returns |
|---|---|---|
| `POST /v1/redact` | `{text, categories?}` | `{text, report, token_map, self_check}` |
| `POST /v1/reinstate` | `{text, token_map}` | `{text, changed}` |
| `POST /v1/guard` | `{text, token_map}` | `{safe, leaks, sanitized_text}` |
| `POST /v1/self-check` | `{text}` | `{findings}` |

The token map travels to/from **your application**, which is trusted — the
property that matters is that the *model* never sees it. Your app redacts,
sends tokenised text to the LLM, screens the reply with `/v1/guard`, and
reinstates locally. Each request is complete in itself, which is what makes
the multi-replica deployment safe.

### Session boundary (opt-in: `REDACTA_SESSIONS=1` — single replica only)

| Endpoint | Body | Returns |
|---|---|---|
| `POST /v1/protect` | `{text, categories?}` | `{text, session_id, expires_at, report, self_check}` |
| `POST /v1/release` | `{text, session_id}` | `{text, changed, tokens_restored}` |
| `POST /v1/check-output` | `{text, session_id}` | `{safe, leaks, sanitized_text}` |
| `POST /v1/discard` | `{session_id}` | `{discarded}` |

Same protect → work-on-tokens → controlled-release loop as the MCP server:
the mapping never leaves the service's memory; the caller holds only an
opaque `rdx_…` session ID. Sessions expire (default 60 min), are capped
(oldest evicted), and **die with the pod** — the safe failure direction. Any
failed lookup returns one generic `"Unknown or expired session."`. These
endpoints refuse loudly when `REDACTA_SESSIONS` is unset, because in-memory
sessions behind a multi-replica Service would fail intermittently — see
[`k8s/boundary.yaml`](k8s/boundary.yaml) for the reasoning.

### Health

`GET /healthz` (liveness) and `GET /readyz` (readiness; 503 while draining
after SIGTERM). Neither requires auth.

## Configuration (environment only)

| Variable | Default | Meaning |
|---|---|---|
| `PORT` | `8080` | Listen port |
| `REDACTA_SESSIONS` | off | `1` serves the session endpoints (single replica only) |
| `REDACTA_SESSION_TTL_MINUTES` | `60` | Session lifetime |
| `REDACTA_MAX_SESSIONS` | `256` | Session cap; oldest evicted at the cap |
| `REDACTA_API_TOKEN` | *(unset)* | Require `Authorization: Bearer <token>` on `/v1/*` |
| `REDACTA_MAX_BODY_BYTES` | `1048576` | Reject larger request bodies |
| `REDACTA_REQUEST_LOGS` | on | `0` disables per-request log lines |
| `REDACTA_SHUTDOWN_GRACE_MS` | `10000` | Drain window after SIGTERM |

Logs never contain request or response bodies, identifiers, token maps, or
session IDs — method, path, status and duration only.

## Run it

```bash
npm ci && npm run build && npm start            # local process
docker build -t redacta-gateway:0.1.0 .          # container
docker run --rm -p 8080:8080 --read-only redacta-gateway:0.1.0
curl -s -X POST localhost:8080/v1/redact \
  -H 'content-type: application/json' \
  -d '{"text":"NHS Number: 943 476 5919"}'
```

For Kubernetes — manifests, a full local walkthrough, and the reasoning
behind the two deployment profiles — see [`k8s/README.md`](k8s/README.md)
and [`docs/KUBERNETES.md`](../docs/KUBERNETES.md).

## Honest limits

Same as every Redacta surface: deterministic patterns plus a verbatim-leak
guard, a strong first line of defence, not a guarantee, and not a substitute
for formal data-protection processes. The service adds one more honest
statement: whoever controls the cluster can read pod memory — Kubernetes
contains the boundary, it does not protect it from its own operators.
