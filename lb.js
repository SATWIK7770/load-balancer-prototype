const http = require("http");
const crypto = require("crypto"); 
const express = require("express");

const networkHostname = "0.0.0.0";
const hostname = "127.0.0.1";
const port = 80;

const latencyMap = new Map([
    ["us-east" , 10],
    ["eu-west" , 50],
    ["asia-south" , 100],
    ["oceania" , 150],
    ["ca-central" , 30]
]);

const regionProximityRank = {
  "us-east": ["us-east", "ca-central", "eu-west", "asia-south", "oceania"],
  "us-west": ["us-east", "ca-central", "eu-west", "asia-south", "oceania"],
  "ca-central": ["ca-central", "us-east", "eu-west", "asia-south", "oceania"],
  "eu-west": ["eu-west", "us-east", "ca-central", "asia-south", "oceania"],
  "me-central": ["eu-west", "asia-south", "us-east", "ca-central", "oceania"],
  "asia-south": ["asia-south", "oceania", "eu-west", "us-east", "ca-central"],
  "oceania": ["oceania", "asia-south", "eu-west", "us-east", "ca-central"]
};

const mode = process.env.mode || "static";
const timeoutBase = parseInt(process.env.timeoutBase) || 2000;

function staticRequestHandler(req , res , reqServer){
  let timeoutDuration = timeoutBase + latencyMap.get(reqServer.region);
  const options = {
    hostname : reqServer.hostname,
    port : reqServer.port,
    path : req.url,
    method : req.method,
    headers : req.headers
  };

  const serverRequest = http.request(options , (serverResponse) => {
    res.writeHead(serverResponse.statusCode , serverResponse.headers);
    serverResponse.on("data" , (chunk) => res.write(chunk));

    serverResponse.on("end" , () => {
      res.end();
    }); 

    serverResponse.on("error" , (err) => {
    res.statusCode = 500;
    res.end(err.message);
    })

  })

  req.on("data" , chunk => serverRequest.write(chunk));
  req.on("end" , () => {
    serverRequest.end();
  });
  req.on("error" , (err) => {
      res.statusCode = 400;
      res.end(err.message);
  })

  serverRequest.on("error" , (err) => {
    res.statusCode = 500;
    res.end(err.message);
  })

  serverRequest.setTimeout(timeoutDuration , () => {
    serverRequest.abort();
    res.statusCode = 500;
    res.end(`server ${reqServer.id} timeout`);
  })

  res.on("error" , () => {
    if (serverRequest) {
    serverRequest.abort();
    }
    console.log(`error in response stream of server id: ${reqServer.id}`);
  }) 
}

function dynamicRequestHandler(req, res, reqServer, isBackup) {
  return new Promise((resolve, reject) => {
    const timeoutDuration = timeoutBase + latencyMap.get(reqServer.serverRegion);

    const options = {
      hostname: reqServer.serverHostname,
      port: reqServer.serverPort,
      path: req.serverURL,
      method: req.method,
      headers: req.headers,
    };

    const serverRequest = http.request(options, (serverResponse) => {
      if (!res.headersSent) {
        res.writeHead(serverResponse.statusCode, serverResponse.headers);
      }

      serverResponse.on("data", (chunk) => res.write(chunk));

      serverResponse.on("end", () => {
        if (!res.headersSent) {
          res.writeHead(200);
        }
        res.end();
        resolve("success");
      });

      serverResponse.on("error", (err) => {
        if (!res.headersSent) {
          res.statusCode = 500;
          if (isBackup) res.end(err.message);
        }
        reject(err);
      });
    });

    req.on("data", (chunk) => {
      try {
        serverRequest.write(chunk);
      } catch (err) {
        if (!res.headersSent) res.end("Error forwarding request data");
        reject(err);
      }
    });

    req.on("end", () => {
      try {
        serverRequest.end();
      } catch (err) {
        if (!res.headersSent) res.end("Error finishing request");
        reject(err);
      }
    });

    req.on("error", (err) => {
      if (!res.headersSent) {
        res.statusCode = 400;
        res.end(err.message);
      }
      resolve("success"); // Client error, not server's fault
    });

    serverRequest.on("error", (err) => {
      if (!res.headersSent) {
        res.statusCode = 500;
        if (isBackup) res.end(err.message);
      }
      reject(err);
    });

    serverRequest.setTimeout(timeoutDuration, () => {
      serverRequest.abort();
      if (!res.headersSent) {
        res.statusCode = 500;
        if (isBackup) res.end("server timeout");
      }
      reject(new Error(`server ${reqServer.id} timeout`));
    });

    res.on("error", () => {
      if (serverRequest) {
        serverRequest.abort();
      }
      console.log(`Response stream error from server: ${reqServer.id}`);
    });
  });
}


if(mode === "static"){            // follow rules strictly , do not take server current state into consideration
  const fs = require("fs");
  const serverList = JSON.parse(fs.readFileSync("servers.json", "utf-8"));
  const serverPool = [];

  serverList.forEach(server => {
    for(let i=0;i<server.capacity;i++){
      serverPool.push(server);
    }
  });

  function hashClientID(clientID){
    const hash = crypto.createHash("sha-256").update(clientID).digest("hex");
    return parseInt(hash.slice(0,8) , 16);
  }

  function targetServer(clientID){
    const hash = hashClientID(clientID);
    return serverPool[hash % serverPool.length];
  }

  const lb = http.createServer((req ,res) => {
    const clientID = req.headers["client-id"];

    if(!clientID){
      res.writeHead(400 , {"Content-Type" : "text/plain"});   // check for client id 
      res.end("client id not present");
      return;
    }

    const reqServer = targetServer(clientID);
    staticRequestHandler(req , res , reqServer);
  })

  lb.listen(port , () =>{
    console.log(`Load Balancer running on http://${hostname}:${port}`);
  })
    
}

else{
  const healthTimeout = parseInt(process.env.healthTimeout) || 5000;
  
  const app = express();

  app.use(express.json());

  const regionServerMap = {
    "us-east" : [],
    "eu-west" : [],
    "asia-south" : [],
    "oceania" : [],
    "ca-central" : []
  }

  app.post("/register" , (req , res) =>{
    const {id , port , region , capacity , hostname , url} = req.body;

    if(!id || !port || !region || !capacity || !hostname || !url){
      res.statusCode = 400;
      res.end("bad request");
      return;
    }

    res.statusCode = 200;
    res.end("registration success");
    
    let server = { 
      serverID : id,
      serverPort : port,
      serverRegion : region,
      serverCapacity : capacity,
      serverHostname : hostname,
      serverURL : url,
      activeConnections : 0,
      isAvailable : true,
      serverLatency : latencyMap.get(region),
      serverScore : null,
      failedPings : 0,
      lastFailedAt : null,
      inCoolDown : false,
      isDegraded : false,

      updateActiveConnections(change){
        this.activeConnections = this.activeConnections + change;
        this.setServerScore();
      },

      setServerScore(){
        if(this.activeConnections == 0){
          this.serverScore = this.serverLatency / this.serverCapacity;
        }
        else{
          this.serverScore = (this.serverLatency / this.serverCapacity) * this.activeConnections;
        }
      }

    }

    server.setServerScore();
    regionServerMap[region].push(server);
    console.log(`Registered server ${id} in ${region}. regionServerMap:`, regionServerMap[region]);
  })

  app.post("/deregister" , (req , res) => {

    const {id , url ,region} = req.body;
    res.status(200).end();

    regionServerMap[region].forEach(server => {
      if(server.serverID == id && server.serverURL == url){
        server.activeConnections = 0;
        let index = regionServerMap[region].indexOf(server);
        regionServerMap[region].splice(index , 1);
      }

    });
  })

  function healthCheck(){
    for(const region in regionServerMap){
      regionServerMap[region].forEach(server => {
        if(server.inCoolDown){
          if(Date.now() - server.lastFailedAt < 120000){
            return;
          }
          else{
            let options = {
              hostname : server.serverHostname,
              port : server.serverPort,
              path : "/health",
              method : "GET",
              timeout : healthTimeout       
            }

            let healthCheckReq = http.request(options , (healthCheckRes) => {
              if(healthCheckRes.statusCode != 200){
                server.isDegraded = true;
              }
              else{
                server.isDegraded = false;
                server.failedPings = 0;
                server.isAvailable = true;
              }
            })

            healthCheckReq.on("error" , () => {
              server.isDegraded = true;
            })

            healthCheckReq.end();
            return;
          }
        }
        let options = {
          hostname : server.serverHostname,
          port : server.serverPort,
          path : "/health",
          method : "GET",
          timeout : healthTimeout       
        }
        let healthCheckReq = http.request(options , (healthCheckRes) => {
          if(healthCheckRes.statusCode != 200){
            server.failedPings++;
            server.isAvailable = false;
            server.activeConnections = 0;
            if(server.failedPings >= 3){
              server.lastFailedAt = Date.now();
              server.inCoolDown = true;
            }
          }
          else{
            server.failedPings = 0;
            server.isAvailable = true;
          }

        })
        
        healthCheckReq.on("error" , () => {
          server.failedPings++;
          server.isAvailable = false;
          server.activeConnections = 0;
          if(server.failedPings >= 3){
              server.lastFailedAt = Date.now();
              server.inCoolDown = true;
            }
        })

        healthCheckReq.end();
      })
      regionServerMap[region] = regionServerMap[region].filter(server => server.isDegraded !== true);
    }
  }

//   setTimeout(() => {
//   setInterval(healthCheck, 10000);
// }, 3000000); // Start health checks after 30 seconds

  // setInterval(healthCheck, 10000);

  setInterval(() => {
  console.log("Heartbeat", Date.now());
}, 1000);


  function allocateServer(clientRegion , primaryServer){
    let targetServer = null;

    if(clientRegion in regionServerMap && regionServerMap[clientRegion].length >= 1){
      let max = -Infinity;
      regionServerMap[clientRegion].forEach(server => {
        if(server === primaryServer){
          return;
        }
        if(server.isAvailable && max < server.serverScore){
          targetServer = server;
          max = server.serverScore;
        }
      }); 
    }
    
    else{
      for(const region of regionProximityRank[clientRegion]){
        let max = -Infinity;
        if(region in regionServerMap && regionServerMap[region].length >= 1){
          for(const server of regionServerMap[region]){
            if(server === primaryServer){
              continue;
            }
            if(server.isAvailable && server.serverScore > max){
              targetServer = server;
              max = server.serverScore;
            }
          }
          break;
        }
      }
    }

    return targetServer;
  }

  const clientSessionMap = new Map();

  async function handleStickySessionRequest(clientRequestStream , clientResponseStream , clientID , primaryServer , clientRegion){
    try{        
        primaryServer.updateActiveConnections(1);
        await dynamicRequestHandler(clientRequestStream , clientResponseStream , primaryServer , false);
        primaryServer.updateActiveConnections(-1);
      }
    catch{    
      primaryServer.isAvailable = false;
      primaryServer.failedPings++;

      let backupServer = allocateServer(clientRegion , primaryServer);
      try {
        if(!backupServer){
          throw new Error("no servers available")
        }
        backupServer.updateActiveConnections(1);
        await dynamicRequestHandler(clientRequestStream , clientResponseStream , backupServer , true);
        backupServer.updateActiveConnections(-1);

        clientSessionMap.set(clientID , {server : backupServer , timer : lastClientRequestTimer(clientID , 0)});
      }
      catch(err){
        if(err.message === "no servers available"){
          clientResponseStream.end("no servers available")
        }

        if(backupServer){
          backupServer.isAvailable = false;
          backupServer.failedPings++;
        }
      }
    }
  }

  function lastClientRequestTimer(clientID , startValue){
    const session = clientSessionMap.get(clientID);
    if(session){
      clearInterval(session.timer);
    }
    let counter = startValue;
    let newTimer = setInterval(() => {
      if(counter === 9000){
        clearInterval(newTimer);
        clientSessionMap.delete(clientID);
      }
      counter++;
    } , 1000);

    return newTimer;
  }

  app.all("*" , async (req , res) => {
    const clientID = req.headers["client-id"];
    const clientRegion = req.headers["client-region"];

    if(!clientID || !clientRegion){
      res.writeHead(400 , {"Content-Type" : "text/plain"});   // check for client id and region
      res.end("not a valid request");
      return;
    }

    if (!regionProximityRank[clientRegion]) {
      res.writeHead(400, { "Content-Type": "text/plain" });
      res.end("Unknown client region");
      return;
    }
     
    let session = clientSessionMap.get(clientID);
    console.log(clientSessionMap);
    // console.log(regionServerMap);
    console.log(session);
    // console.log(clientRegion);

    if(session && session.server && session.server.isAvailable && session.server.activeConnections < 0.90 * session.server.serverCapacity){
      let reqServer = session.server;
      session.timer = lastClientRequestTimer(clientID , 0);
      await handleStickySessionRequest(req, res , clientID , reqServer , clientRegion);
           
    }
    else if(session && session.server && session.server.isAvailable && session.server.activeConnections > 0.90 * session.server.serverCapacity){
      let primaryServer = session.server;
      let backupServer = allocateServer(clientRegion , primaryServer);

      session.timer = lastClientRequestTimer(clientID , 0);
      if (!backupServer) {
        res.writeHead(503, { "Content-Type": "text/plain" });
        res.end("No available backup server");
        return;
      }

      await handleStickySessionRequest(req, res , clientID , backupServer , clientRegion); 
    }
    else{
      let reqServer = allocateServer(clientRegion , null);
      console.log(reqServer);
      if (!reqServer){  
      res.writeHead(503, { "Content-Type": "text/plain" });
      res.end("No available server found");
      return;
      }

      clientSessionMap.set(clientID , {server : reqServer , timer : lastClientRequestTimer(clientID , 0)});

      await handleStickySessionRequest(req , res , clientID , reqServer , clientRegion);
    }
  })

  const lb = http.createServer(app);

  lb.listen(port , () => {
    console.log(`load balancer running on ${hostname} on port ${port}`);
  });

}