# Kubernetes for Redacta — what each piece does and why

This explains the deployment in `gateway-service/k8s/` in terms of Redacta,
not as a generic Kubernetes tutorial. The walkthrough lives in
[`gateway-service/k8s/README.md`](../gateway-service/k8s/README.md); this
document explains *why* each object exists and what would break without it.

## Docker vs Kubernetes, in one Redacta-shaped sentence

**Docker packages and runs one instance of Redacta** — the
`gateway-service/Dockerfile` turns the TypeScript service into an image that
runs identically anywhere. **Kubernetes manages how many instances run and
what happens to them** — it keeps two gateway pods alive, replaces one when
it dies, routes traffic only to ready pods, rolls out a new image with zero
downtime, and scales the count with load. Docker answers "how does Redacta
run?"; Kubernetes answers "how is Redacta *operated*?".

## The design decision that shaped everything: state

Redacta's session boundary (`protect` → `release`) keeps token mappings in
**process memory** — deliberately: nothing sensitive is ever written to disk
or shipped to a store. That one fact decides the whole topology, because two
pods don't share memory. `protect` on pod A followed by `release` on pod B
fails, and so — less obviously — does every ordinary Kubernetes lifecycle
event: a rolling update, a scale-down, a pod eviction all destroy live
sessions.

So there are two deployments of the same image:

- **`redacta-gateway`** serves only the *stateless* operations (`/v1/redact`
  returns the token map to the trusted caller; `/v1/reinstate` and
  `/v1/guard` take it back). Every request is complete in itself, so
  replicas, rolling updates and autoscaling are all safe. The privacy
  property that matters — *the model never sees the mapping* — is preserved,
  because the caller is your own application, not the LLM.
- **`redacta-boundary`** serves the session loop with **exactly one
  replica**. That is not a limitation to engineer away casually: sticky
  sessions break on every rollout and scale event (and fail *intermittently*,
  the worst way), and a shared session store would put PHI mappings outside
  process memory — which demands real encryption and key management before
  it's defensible. Until that exists, one honest replica beats two
  misleading ones.

Everything below is in service of operating those two deployments.

## The objects, one by one

### Pod
The unit Kubernetes actually runs: one or more containers with shared
network identity. You never create Redacta pods directly — you describe what
a pod should look like, and controllers create them. **Without pods** there
is nothing running at all; but equally, *bare* pods (without a controller)
would never be replaced when they die.

### Deployment (`deployment.yaml`, `boundary.yaml`)
The controller that owns Redacta's pods: "keep N replicas of this template
running." Delete a gateway pod and the Deployment notices the count is wrong
and creates a replacement within seconds — that is the self-healing you can
demo by killing a pod. It also owns *how change happens*:

- `redacta-gateway` uses **RollingUpdate** with `maxUnavailable: 0`,
  `maxSurge: 1`: a new-version pod is created, must pass its readiness
  probe, and only then is an old pod retired. Verified in testing: 200
  consecutive requests during an update, zero failures.
- `redacta-boundary` uses **Recreate**: kill the old pod, then start the
  new one. A rolling update *cannot* preserve in-memory sessions anyway —
  Recreate states what actually happens instead of pretending otherwise.

**Without a Deployment**, a crashed Redacta process would stay dead, and
updates would mean manual delete-and-recreate with downtime you manage by
hand.

### Replica
One copy of the pod template. Two gateway replicas mean one can die (or be
drained during a node upgrade) while Redacta keeps answering. The boundary
runs one replica *on purpose* — see above. **Without ≥2 replicas** on the
gateway, every deploy or crash is user-visible downtime.

### Service (`service.yaml`, and one in `boundary.yaml`)
A stable name and virtual IP in front of pods that are, by design,
ephemeral and renamed on every restart. In-cluster applications call
`http://redacta-gateway.redacta.svc.cluster.local` and kube-proxy spreads
requests across ready pods (verified: ~50/50 across two replicas). The two
Services are also the *choice architecture*: callers pick `redacta-gateway`
(stateless, scaled) or `redacta-boundary` (sessions, single pod)
explicitly. `type: ClusterIP` keeps both internal-only — matching the
positioning that Redacta sits inside your infrastructure. **Without a
Service**, callers would have to track pod IPs that change constantly, and
there would be no load balancing.

### ConfigMap (`configmap.yaml`)
Non-secret configuration — session TTL, session cap, body-size limit —
injected as environment variables, using the same `REDACTA_*` names as the
MCP server. Configuration lives in the cluster, not in the image, so
changing the TTL is an `apply` + restart, not a rebuild. **Without it**,
every config change would mean building and shipping a new image, and
config would be invisible to `kubectl`.

### Secret (`secret.example.yaml`)
Like a ConfigMap but for credentials — here, the optional
`REDACTA_API_TOKEN` that makes callers present a bearer token. The
deployments reference it with `optional: true`: create the Secret and auth
turns on; don't, and the service runs open for trusted-network setups. The
committed file is a placeholder-only template; the honest caveat is that
Kubernetes Secrets are base64-encoded, **not encrypted**, by default —
enable encryption at rest before treating them as strong protection.
**Without a Secret**, the token would sit in a ConfigMap or image layer,
readable by anyone who can read those.

### Liveness probe
`GET /healthz` every 10s: "is this Redacta process alive?" Three failures
and kubelet **restarts the container**. This is the defence against a hung
process — one that holds the port but answers nothing. **Without it**, a
wedged pod stays in the rotation forever, silently eating a share of
traffic.

### Readiness probe
`GET /readyz` every 5s: "should traffic be routed here *right now*?"
Failure removes the pod from Service endpoints **without restarting it**.
Redacta has no dependencies to wait on, so readiness earns its keep at the
edges of the lifecycle: a just-started pod gets no traffic until it answers,
and a terminating pod flips `/readyz` to 503 on SIGTERM so it drains
gracefully. It would diverge from liveness properly if the service ever
gained a dependency (say, a future encrypted vault) that can be *down*
while the process is *fine*. **Without it**, rolling updates would route
requests to pods that aren't listening yet — visible errors on every
deploy.

### Resource request
What the scheduler *reserves*: 50m CPU, 64Mi memory per pod. Kubernetes
places pods on nodes based on requests, and the HPA's percentages are
measured against them. **Without requests**, pods land on full nodes and
the HPA has no denominator — `cpu: <unknown>`.

### Resource limit
Where the kernel steps in: CPU above 500m is throttled; memory above 256Mi
gets the container OOM-killed. For the *boundary* pod the memory limit has a
privacy-relevant meaning: it is the hard ceiling on live session maps —
size `REDACTA_MAX_SESSIONS` so the worst case fits, or the OOM kill takes
every session with it. These are conservative example values; measure real
workloads before trusting them. **Without limits**, one runaway pod can
starve everything else on the node.

### Rolling update
Not an object but a behaviour of the gateway Deployment, and the reason
"deploying a new Redacta version" is a non-event: new pod up → ready →
old pod drained (SIGTERM → `/readyz` 503 → in-flight requests finish →
exit), repeat. `terminationGracePeriodSeconds: 30` is the ceiling before
SIGKILL. **Without it** (strategy Recreate everywhere), every release would
be an outage — acceptable for the boundary, where it's honest, unacceptable
for the gateway, where it's avoidable.

### HorizontalPodAutoscaler (`hpa.yaml`)
Watches gateway CPU (via metrics-server) against the 50m request and moves
`replicas` between 2 and 10 to hold ~70% utilisation. Verified live:
sustained redaction load took the deployment from 2 to 7 replicas without
intervention. Two honest caveats, both in the file itself: CPU is the
metric every cluster has, not necessarily the *right* one (request rate or
p99 latency are often better, but need a metrics pipeline this repo doesn't
justify yet); and the HPA must **never** target the boundary — scaling it up
breaks session routing, scaling it down destroys sessions. **Without an
HPA**, scaling is a human running `kubectl scale` — fine at small scale,
just slower.

### Namespace (`namespace.yaml`)
A named box (`redacta`) holding everything above: one `kubectl delete
namespace redacta` removes the whole installation, RBAC and NetworkPolicies
can target it as a unit, and Redacta's names can't collide with other
teams'. **Without it**, Redacta's objects scatter through `default`,
entangled with everything else.

## Security posture (and its honest edges)

Both deployments run with `runAsNonRoot` (uid 1000), all Linux capabilities
dropped, no privilege escalation, a read-only root filesystem (possible
because the service writes nothing — a deliberate consequence of not
porting the MCP server's file-release mode), and the default seccomp
profile. Logs carry method/path/status/duration only — no bodies, no
identifiers, no session IDs. Nothing PHI-shaped is ever persisted:
no volumes, no stores, sessions in memory only.

The edge stated plainly: **Kubernetes contains the boundary; it does not
protect it from the cluster's own operators.** Anyone with exec/debug
rights on the namespace or root on a node can read pod memory, including
live session maps. That is the same trust statement the MCP server makes
about the machine it runs on, relocated to a cluster. RBAC on the
namespace, encryption at rest for Secrets, and NetworkPolicies are the
next real steps for a hostile-multi-tenant cluster — deliberately not
shipped here as unverifiable YAML ceremony.
