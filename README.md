Load Balancer Prototype

This is a Node.js HTTP load balancer that implements both static (weighted hashing) and dynamic (region-aware, latency/availability-aware) routing. It supports server registration/deregistration, health checks with cooldown, sticky sessions with expiry, capacity-aware scoring, and region-proximity fallback.
