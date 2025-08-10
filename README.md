# Load Balancer Simulation – Static & Dynamic Modes

This project implements a high-quality **load balancer prototype** in **Node.js** with both **static** and **dynamic** modes, designed for showcasing advanced system design concepts. It simulates realistic network conditions, client–server latency, region-aware routing, sticky sessions, and failover handling, making it suitable for demonstration in professional applications.

---

## Features

### 🖥️ Cockpit Central Control
A dedicated Ubuntu container runs Cockpit, a web-based server management tool, allowing:
-Starting/stopping servers
-Simulating server crashes
-Restarting services

### Static Mode
- Uses **Weighted Hashing Algorithm** with pre-defined servers from a configuration file.
- Ignores server health and load — strictly follows static mapping rules.
- Simulates client-to-server latency based on assigned regions.

### Dynamic Mode
- **Server Registration/Deregistration** – servers can join/leave at runtime.
- **Health Checks & Failover** – automatically detects server downtime and switches to backups.
- **Latency-Aware Scoring** – assigns requests to the best available server considering region and response time.
- **Sticky Sessions with Expiry** – maintains client–server mapping for 5 minutes of inactivity.
- **Region-Based Allocation** – prioritizes servers in the same region as the client.
- **Timeout Handling** – region-aware timeouts for slow servers.

---

## Technology Stack
- **Node.js** + **Express** – load balancer and server simulation.
- **Axios** – request forwarding with timeout handling.
- **Docker** – containerized load balancer and servers for easy setup and isolation.
- **k6** – traffic simulation for testing performance under load.

---

## Docker Usage

This project supports running the **load balancer** and **multiple servers** in isolated containers within a custom Docker network.

Example commands:

```bash
# Create a network for communication between containers
docker network create my-network

# Setup cockpit
docker run -it --rm \
  -v /var/run/docker.sock:/var/run/docker.sock \
  --network lb-net \
  --name cockpit \
  ubuntu bash

apt update && apt install docker.io -y
apt install curl

# Run Load Balancer
docker run -d --name lb --network my-network -p 80:80 myloadbalancer

# Run Server
docker run -d --name server1 --network my-network \
  -e serverID=s1 \
  -e port=3000 \
  -e region=us-east \
  -e capacity=10 \
  -e serverType=static \
  -e hostname=server1 \
  -e lbURL=http://lb:80 \
  myserver


