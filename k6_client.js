import http from 'k6/http';
import { sleep } from 'k6';

const latencyMap = {
  "us-east": 10,
  "eu-west": 50,
  "asia-south": 100,
  "oceania": 150,
  "ca-central": 30,
  "me-central": 75,
  "us-west": 20
};

const regions = Object.keys(latencyMap);

// STAGES:
// 1. Baseline: Light traffic (10 users) for 2m
// 2. Steady: Moderate traffic (30 users) for 3m
// 3. Spike: Sudden high load (60 users) for 2m

export const options = {
  stages: [
    { duration: '30s', target: 10 },  // Warm-up (All 10 servers active)
    { duration: '30s', target: 30 },  // Initial load
    { duration: '1m', target: 30 },   // Failure 1: Asia-South fails
    { duration: '10s', target: 60 },   // Spike with some clients stuck
    { duration: '1m', target: 60 },   // Failure 2: EU-West fails
    { duration: '1m', target: 60 },   // Failure 3: US-East fails
    { duration: '1m', target: 20 },   // Cooldown / Degraded observation
  ]
};

export default function () {
  const clientID = `client-${__VU}`;
  const region = regions[Math.floor(Math.random() * regions.length)];
  const delay = latencyMap[region];

  sleep(delay / 1000); // simulate RTT delay

  const headers = {
    'Content-Type': 'text/plain',
    'client-id': clientID,
    'client-region': region
  };

  const res = http.get('http://localhost:8080', { headers });

  console.log(`Client: ${clientID}, Region: ${region}, Response: ${res.status} - ${res.body}`);
}
