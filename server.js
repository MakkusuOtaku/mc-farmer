const express = require('express');
const mineflayer = require('mineflayer');
const { Server } = require('socket.io');

const app = express();
const port = 80;
const bots = [];

app.get('/', async (request, response)=>{
	response.sendFile(`web/index.html`, { root: "./" });
});

app.use(express.static('./web'));

const server = app.listen(port);
const io = new Server(server);

const fakeChunkData = [
	0, 0, 1, 1, 1, 0, 0,
	0, 1, 1, 1, 1, 1, 0,
	1, 1, 1, 1, 1, 1, 1,
	1, 1, 1, 1, 1, 1, 1,
	1, 1, 1, 1, 1, 1, 1,
	0, 1, 1, 1, 1, 1, 0,
	0, 0, 1, 1, 1, 0, 0,
];

io.on('connection', (socket)=>{
	console.log('User connected.');

	setTimeout(()=>{
		io.emit('chunk-update', {
			bot: null,
			data: fakeChunkData,
		});
	}, 1000);

	socket.on('disconnect', ()=>{
		console.log('User disconnected.');
	});
});

function createBot() {
	let bot = mineflayer.createBot({
		"name": `Machine_${bots.length}`,
		"host": "localhost",
	});

	bot.once('spawn', ()=>{
		scanSurroundings(bots[0]);
	})

	bots.push(bot);
}

function scanSurroundings(bot) {
	let openList = [];
	let closedList = [];

	io.emit('chunk-update', {
		bot: bot.username,
		data: fakeChunkData,
	});
}

createBot();