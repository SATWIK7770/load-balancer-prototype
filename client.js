const http = require("http");

const id = process.argv[2];
const region = process.argv[3] || "us-east";

const latencyMap = {   // latency from client to lb
  "us-east": 10,
  "eu-west": 50,
  "asia-south": 100,
  "oceania": 150,
  "ca-central": 30,
  "me-central": 75,
  "us-west": 20
};

const lbURL = "http://localhost:80";
const delay = latencyMap[region];


function sendRequest(){

    const options = {
        hostname : "localhost",
        port : 80,
        path : "/",
        method : "GET",
        headers : {
            "Content-Type" : "text/plain",
            "client-id" : id,
            "client-region" : region
        }
    }

    setTimeout(() => {
        const req = http.request(options , (res) => {

            let data = "";

            res.on("data" , (chunk) => {
                data = data + chunk;
            })

            res.on("end" , () => {
                console.log(data);
            })

            res.on("error" , (err) => {     // for errors that occur in the response stream eg(connection interruptions , data corruption)
            console.error(err);
            })
        })

        req.on("error" , (err) => {     // for errors that occur before the req is accepted by the server (eg server unavailable , network delays)
            console.error(err);
        })

        req.setTimeout(10000 , () => {         // error handling specifically for timeouts
            console.error("server timeout");
            req.abort();
        })

        req.end();
    } , delay);
}

sendRequest();

