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
The load balancer is exposed to the client while the servers are isolated from public only accessible by the load balancer.  
To start , first create containers of load balancer and the required servers.

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

# Run Load Balancer(static mode)
docker run -it --rm `
  --mode static `
  --name lb `
  --network my-network `
  -p 8080:80 `
  -v ${PWD}\servers.json:/app/servers.json `
  mylb

# Run Load Balancer(dynamic mode)
docker run -it --rm `
  --mode dynamic `
  --name lb `
  --network my-network `
  -p 8080:80 `
  mylb

# Run Server
docker run -d --name server1 --network my-network \
  -e serverID=s1 \
  -e port=3000 \
  -e region=us-east \
  -e capacity=10 \
  -e serverType=static/dynamic \
  -e hostname=server1 \
  -e lbURL=http://lb:80 \
  myserver

# Starting/Crashing/Ending server via cockpit-
curl -X POST http://server1:3000/control/start
curl -X POST http://server1:3000/control/crash
curl -X POST http://server3:3000/control/end

```
---

### Testing Phase
I did load testing via the k6.js module using the following schemes-  
- **Static Mode** (refer the servers.json) file -
  - Crash server6 at 1 min
  - Crash server7 at 2 min 10 sec
  - Crash server5 at 3 min 10 sec
  - Crash server3 at 4min

- **Dynamic Mode** (same server configuration as used in static mode)
  - Crash server6 at 1 min
  - Crash server7 at 2 min 10 sec
  - Restart server6 at 2 min 40 sec
  - Crash server5 at 3 min 10 sec
  - Restart server7 at 3 min 40 sec
  - Crash server3 at 4 min 10 sec
  - Restart server5 at 4 min 40 sec

 ---

 ### Results
- **Static Mode**  (19.38% requests failed)
   <img width="1731" height="572" alt="Screenshot 2025-08-04 114711" src="https://github.com/user-attachments/assets/bbed55b7-ff8e-4986-bd66-933fd4db89a3" />

 - **Dynamic Mode**  (only 6.71% requests failed)
   <img width="1577" height="449" alt="Screenshot 2025-08-10 162947" src="https://github.com/user-attachments/assets/df85b574-bcb0-47c8-be25-e018179149b7" />


 





