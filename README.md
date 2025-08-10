# Load Balancer Prototype

This is a Node.js HTTP load balancer that implements both static (weighted hashing) and dynamic (region-aware, latency/availability-aware) routing. It supports server registration/deregistration, health checks with cooldown, sticky sessions with expiry, capacity-aware scoring, and region-proximity fallback.


# Features Implemented

## Dual Modes

- **Static mode**  
  Reads `servers.json`, expands each server by `capacity` into a `serverPool`, and maps clients to servers using a **SHA-256 based weighted hash** (`client-id` header → deterministic server).

- **Dynamic mode**  
  Servers register at runtime via HTTP `/register` and deregister via `/deregister`. The LB maintains an in-memory `regionServerMap`.

---

## Region & Latency Awareness

- `latencyMap` defines per-region base latency (used in timeout computation / scoring).
- `regionProximityRank` provides fallback order when local region servers are unavailable.

---

## Capacity-Aware Server Scoring

- Each registered server maintains:
  - `activeConnections`
  - `serverLatency`
  - `serverCapacity`  
  These values are used to compute a `serverScore` for selection.

---

## Sticky Sessions (Session Affinity)

- `clientSessionMap` holds **client → server** mappings.
- Sessions include a timer (`lastClientRequestTimer`) that expires sessions after inactivity (timer logic present in code).

---

## Failover and Backup Selection

- If a primary server fails or becomes overloaded, a backup server is selected using:
- `allocateServer(clientRegion, primaryServer)` which prefers same-region servers and falls back to proximate regions.

---

## Health Checks & Degraded Handling

- Periodic `healthCheck()` runs (configured via `healthTimeout` and scheduled via `setInterval`):
- Pings `/health` on each registered server.
- Increments `failedPings` and moves servers into `inCoolDown` and `isDegraded` when failures exceed threshold.
- Resets `failedPings` when the server recovers.
- Filters out explicitly `isDegraded === true` servers from the region map.

---

## Timeout and Abort Behavior

- Request forwarding uses timeouts computed as `timeoutBase + latencyMap.get(region)`
- Both static and dynamic handlers abort outbound requests on timeout and return 500 to the client.

---

## HTTP Proxying

- Full request/response proxying for HTTP methods:
- Request body streaming (`req.on('data')`)
- Response chunk piping back to clients
- Header handling to avoid double-sending

---

## Server Registration API

- `POST /register` — registers a server with: `{ "id": "s1", "port": 3000, "region": "us-east", "capacity": 10, "hostname": "localhost", "url": "http://localhost:3000" }`
- `POST /deregister` — deregisters a server with: `{ id, url, region }`



