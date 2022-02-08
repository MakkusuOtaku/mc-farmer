const express = require('express');
const server = express();

const port = 80;

server.get('/', async (request, response)=>{
	response.sendFile(`web/index.html`, { root: "./" });
});

server.use(express.static('./'));

server.listen(port, ()=>{
	console.log(`Running server on port ${port}.`);
});