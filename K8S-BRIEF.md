# Kubernetes milestone — brief for the next session

**Goal:** a small, production-credible way to run Redacta's privacy boundary as
an in-cluster service beside your agents. Design note first, YAML second.

## Fixed points (decided during the v2 → 2.1.0 work, Aug 2026)

1. **What gets deployed** is a thin HTTP service wrapping `PrivacyGateway`
   from `@pharmatools/redacta` (≥ 1.4.0) — the same protect / release /
   check_output loop as the MCP server. Do not re-implement boundary logic;
   one source of truth (see `GATEWAY.md`, `mcp-server/DESIGN.md`).
2. **Positioning is self-hosted only:** the hospital's / customer's own
   cluster or VPC. Never a hosted Redacta — "nothing leaves your
   infrastructure" is the moat, and PHI transiting a third party breaks it.
3. **The one real design question is multi-replica session state.** Sessions
   are in-memory; `protect` on pod A + `release` on pod B fails. Options:
   single replica (honest, simplest), sticky sessions, or a shared session
   store — the last makes the deferred encrypted-vault work load-bearing
   (PHI mappings in Redis/etc. need real encryption + key-management answers).
   Settle this in the design note before writing manifests.
4. **Keep claims honest:** no "HIPAA compliant", no hosted-multi-tenant
   assumptions, and state plainly what a compromised cluster can reach.
5. **Scope discipline:** "small but production-credible" = probes, resource
   limits, restrictive securityContext, no-PHI logs, and a clean story for
   secrets — not a Helm platform. Prior art for sizing: the v2 vertical slice.

## Release trains already in place

CI (`ci.yaml`) gates the privacy invariant on every push; `redacta-*` tags
drive the MCPB / npm / MCP Registry pipeline. A new service would need its own
image build + publish path — decide in the design note whether it joins the
existing workflow or gets its own.
