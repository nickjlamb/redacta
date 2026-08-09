# Deploying Redacta to Kubernetes

Plain YAML, applied in order, no Helm — so you can see exactly what
Kubernetes is doing. Concepts are explained in
[`docs/KUBERNETES.md`](../../docs/KUBERNETES.md); the state/replica design is
explained in the header of [`boundary.yaml`](boundary.yaml).

Two deployment profiles from one image:

| | `redacta-gateway` | `redacta-boundary` |
|---|---|---|
| Endpoints | stateless: `/v1/redact`, `/v1/reinstate`, `/v1/guard`, `/v1/self-check` | those + sessions: `/v1/protect`, `/v1/release`, `/v1/check-output`, `/v1/discard` |
| Replicas | 2, HPA up to 10 | exactly 1, by design |
| Update strategy | RollingUpdate (zero downtime) | Recreate (sessions die anyway; say so) |
| Token map | returned to the trusted caller | held in pod memory, never returned |

## Local walkthrough (kind)

Prerequisites: Docker, [kind](https://kind.sigs.k8s.io), kubectl.

```bash
# 1. Build the image
cd gateway-service
docker build -t redacta-gateway:0.1.0 .

# 2. Create a local cluster and load the image into it
#    (kind nodes can't see your local Docker images without this)
kind create cluster --name redacta
kind load docker-image redacta-gateway:0.1.0 --name redacta

# 3. Deploy
kubectl apply -f k8s/namespace.yaml
kubectl apply -f k8s/configmap.yaml
kubectl apply -f k8s/deployment.yaml -f k8s/service.yaml
kubectl apply -f k8s/boundary.yaml
kubectl apply -f k8s/hpa.yaml     # optional; needs metrics-server (see below)

# Optional: require a bearer token on every /v1/* call
kubectl -n redacta create secret generic redacta-gateway-token \
  --from-literal=REDACTA_API_TOKEN="$(openssl rand -hex 32)"
kubectl -n redacta rollout restart deployment  # pick up the Secret

# 4. Watch it come up
kubectl -n redacta get pods -w        # Ctrl-C when 2 gateway + 1 boundary are Running
kubectl -n redacta get deploy,svc,hpa

# 5. Make a real request through the Service
kubectl -n redacta port-forward svc/redacta-gateway 8080:80 &
curl -s -X POST localhost:8080/v1/redact \
  -H 'content-type: application/json' \
  -d '{"text":"Patient NHS Number: 943 476 5919, email patricia.hartley@example.com"}'
# -> tokenised text + report + token_map + self_check

# ... and the session loop through the boundary Service
kubectl -n redacta port-forward svc/redacta-boundary 8081:80 &
curl -s -X POST localhost:8081/v1/protect \
  -H 'content-type: application/json' \
  -d '{"text":"NHS Number: 943 476 5919 for Mrs Patricia Hartley"}'
# -> {"text":"NHS Number: [NHS_NUMBER_1] for [PATIENT_NAME_1]","session_id":"rdx_…",...}
curl -s -X POST localhost:8081/v1/release \
  -H 'content-type: application/json' \
  -d '{"text":"[PATIENT_NAME_1] ([NHS_NUMBER_1]) may be discharged.","session_id":"rdx_…"}'
# -> originals restored — the map never left the pod

# 6. Logs (no PHI, ever — method/path/status/duration only)
kubectl -n redacta logs deploy/redacta-gateway

# 7. Kill a pod; watch the Deployment replace it
kubectl -n redacta delete pod -l app.kubernetes.io/name=redacta-gateway \
  --field-selector=status.phase=Running --wait=false
kubectl -n redacta get pods -w   # a new pod appears within seconds

# 8. Rolling update to a new version — zero downtime
docker build -t redacta-gateway:0.1.1 .
kind load docker-image redacta-gateway:0.1.1 --name redacta
kubectl -n redacta set image deployment/redacta-gateway gateway=redacta-gateway:0.1.1
kubectl -n redacta rollout status deployment/redacta-gateway

# 9. Scale manually
kubectl -n redacta scale deployment/redacta-gateway --replicas=4

# 10. Or let the HPA do it (needs metrics-server; on kind:
#     kubectl apply -f https://github.com/kubernetes-sigs/metrics-server/releases/latest/download/components.yaml
#     then patch its deployment args with --kubelet-insecure-tls)
kubectl -n redacta get hpa -w     # generate load and watch REPLICAS grow

# 11. Tear down
kind delete cluster --name redacta
```

## Notes

- **Never scale `redacta-boundary` past 1.** Sessions live in that pod's
  memory; a second replica answers "Unknown or expired session." for
  sessions it never stored. The header comment in `boundary.yaml` explains
  why sticky sessions and shared stores were rejected for now.
- **Resource values are conservative examples.** Measure your own workload;
  redaction cost scales with text size and request rate.
- **Secrets:** `secret.example.yaml` is a placeholder-only template. Prefer
  `kubectl create secret` (shown above) so real tokens never touch a file.
  Kubernetes Secrets are base64-encoded, not encrypted, by default — enable
  encryption at rest for production use.
- **What a compromised cluster can reach, stated plainly:** anyone with
  `kubectl exec`/debug rights on the namespace, or root on a node, can read
  pod memory — including live session maps on the boundary pod and any text
  in flight. Kubernetes runs the boundary inside your perimeter; it does not
  defend it from your own cluster admins. Restrict namespace access (RBAC),
  add a NetworkPolicy if your CNI enforces them, and treat the audit story
  the same as the MCP server's: no PHI in logs by construction.
