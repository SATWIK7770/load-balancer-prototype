const http = require("http");
const axios = require("axios");
const express = require("express");

const app = express();

app.use(express.json());

class server{
    static networkHostname = "0.0.0.0";

    static latencyMap = new Map([    // latency from server to lb(rtt)
    ["us-east" , 10],
    ["eu-west" , 50],
    ["asia-south" , 100],
    ["oceania" , 150],
    ["ca-central" , 30]
    ]);
    
    constructor(){
        this.id = process.env.serverID;

        this.port = parseInt(process.env.port) || 3000;

        this.region = process.env.region || "us-east";

        this.capacity = parseInt(process.env.capacity);

        this.serverType = process.env.serverType || "static";

        this.hostname = process.env.hostname;

        this.url = `http://${this.hostname}:${this.port}`;

        this.lbURL = process.env.lbURL;

        this.httpServer = http.createServer(app);

        this.latency = server.latencyMap.get(this.region);  

        this.isAvailable = true;

        if (!this.id || !this.capacity || !this.hostname || !this.lbURL) {
            throw new Error("Missing required SERVER_* environment variables");
        }

    }

    start(){
        if(this.isAvailable){
            this.httpServer.listen(this.port , server.networkHostname , () => {
                console.log(`server ${this.id} is running at ${this.url}`);
            });

            if(this.serverType === "dynamic"){
                this.register();
            }
        }
    }

    end(){        
        this.setisAvailable(false);

        if(this.serverType === "dynamic"){
            this.deregister();
        }
        
        this.httpServer.close((err) => {
            if(err){
                console.error(`Error shutting down server${this.id}:`, err);
            }
            else{
                console.log(`server ${this.id} has been shut down`);
            }
        });

    }

    setisAvailable(value){
        if(value == false){
            this.isAvailable = false;
        }

        else{
            if(this.isAvailable == false){
                this.isAvailable = true;
            }
        }
    }

    async register(){
        try{
            const data = {
                id : this.id,
                port : this.port,
                region : this.region,
                capacity : this.capacity,
                hostname : this.hostname,
                url : this.url
            };

            const regRes = await axios.post(this.lbURL + "/register" , data);
            console.log(`Registered server ${this.id} with load balancer:`, regRes.data);
        }
        catch(err){
            console.error(err.response.data);
        }
    }

    deregister(){        
        const data = {
            id: this.id,
            url: this.url,
            region: this.region
        };

        axios.post(this.lbURL + "/deregister" , data)
        .then(() => {console.log(` Server ${this.id} deregistered from load balancer.`)})
        .catch(err => {console.error(err)});
    }
}

let node = new server();
let delay = node.latency;
node.start();

app.post("/control/start" , (req ,res) => {
    node.setisAvailable(true);
    res.end();
})

app.post("/control/end" , (req , res) => {
    node.end();
    res.end();
})

app.post("/control/crash" , (req , res) => {
    node.setisAvailable(false);
    res.end();
})

app.get("/health" , (req , res) => {
    if(!node.isAvailable){
        res.statusCode(503).end();
    }
    res.statusCode = 200;
    res.end("ok");
})

app.all("*" , (req , res) => {
    if (!node.isAvailable) {
        res.statusCode = 503;
        return res.end("Server currently unavailable");
    }

    setTimeout(() => {
        res.writeHead(200 , {
            "Content-Type" : "text/html",
            "serverID" : node.id,
            "serverRegion" : node.region
        });
        
        const body = ` 
            <!DOCTYPE html>
            <html>
            <head>
                <title>Hello from ${node.id}</title>
            </head>
            <body>
                <h1>Hello from Server ${node.id} in ${node.region}</h1>
            </body>
            </html>`;

        res.write(body);
        res.end();      

        res.on("error" , (err) => {
            console.log(err);
        });
    } , delay);
})
