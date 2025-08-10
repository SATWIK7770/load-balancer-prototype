Load Balancer Prototype

This is a Node.js HTTP load balancer that implements both static (weighted hashing) and dynamic (region-aware, latency/availability-aware) routing. It supports server registration/deregistration, health checks with cooldown, sticky sessions with expiry, capacity-aware scoring, and region-proximity fallback.


Features implemented-
Dual modes

Static mode: reads servers.json, expands each server by capacity into a serverPool, and maps clients to servers using a SHA-256 based weighted hash (client header client-id → deterministic server).

Dynamic mode: servers register at runtime (HTTP /register) and deregister (/deregister). The LB maintains an in-memory regionServerMap.

Region & latency awareness

latencyMap defines per-region base latency (used in timeout computation / scoring).

regionProximityRank provides fallback order when local region servers are unavailable.

Capacity-aware server scoring

Each registered server maintains activeConnections, serverLatency, serverCapacity and computes a serverScore used for selection.

Sticky sessions (session affinity)

clientSessionMap holds client → server mappings.

Sessions include a timer (lastClientRequestTimer) that expires sessions after inactivity (timer logic present in code).

Failover and backup selection

If a primary server fails / becomes overloaded, a backup server is selected using allocateServer(clientRegion, primaryServer) which prefers same-region servers and falls back to proximate regions.

Health checks & degraded handling

Periodic healthCheck() runs (configured via healthTimeout and scheduled via setInterval) that:

Pings /health on each registered server.

Increments failedPings and moves servers into inCoolDown and isDegraded when failures exceed threshold.

Resets failedPings when the server recovers.

Filters out explicitly isDegraded === true servers from the region map.

Timeout and abort behavior

Request forwarding uses timeouts computed as timeoutBase + latencyMap.get(region).

Both static and dynamic handlers abort outbound requests on timeout and return 500 to the client.

HTTP proxying

Full request/response proxying for HTTP methods: request body streaming (req.on('data')) and piping response chunks back to clients, with header handling to avoid double-sending.

Server registration API

POST /register — registers a server with { id, port, region, capacity, hostname, url }.

POST /deregister — deregisters a server with { id, url, region }.

How it works (brief)
Static mode: deterministic mapping using client-id hash → serverPool entry (capacity-weighted). No runtime health awareness.

Dynamic mode: servers register themselves; the LB periodically health-checks servers and maintains availability flags. Clients are matched first to sticky sessions (if valid), otherwise to the best available server in the region or a proximate region.

