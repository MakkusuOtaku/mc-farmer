const mineflayer = require('mineflayer');
const vec3 = require('vec3');

var cropType = 'wheat_seeds'

var seedName = 'wheat_seeds';
var harvestName = 'wheat';

const bot = mineflayer.createBot({
	host: "localhost",
	username: "FarmMachine",
	//viewDistance: "tiny",
});

var bedPosition;
var chestPosition;
var mcData;

bot.on('kicked', (reason, loggedIn) => console.log(reason, loggedIn));
bot.on('error', err => console.log(err));

bot.once('spawn', ()=>{
	mcData = require('minecraft-data')(bot.version);
	cosmicLooper();
});

bot.on('whisper', (username, message)=>{
	let tokens = message.split(' ');

	switch(tokens[0]) {
		case 'bed':
			bedPosition = vec3(parseInt(tokens[1]), parseInt(tokens[2]), parseInt(tokens[3]));
			break;
		case 'chest':
			chestPosition = vec3(parseInt(tokens[1]), parseInt(tokens[2], parseInt(tokens[3])));
			break;
	}
});

async function cosmicLooper() {

	if (bot.time.timeOfDay > 12000) await sleepLoop();
	else if (bot.inventory.slots.filter(v=>v==null).length < 11) {
		await depositLoop();
	} else await farmLoop();

	setTimeout(cosmicLooper, 20);
}

async function sleepLoop() {
	if (!bedPosition) {
		let bed = bot.findBlock({
			matching: blk=>bot.isABed(blk),
		});
		bedPosition = bed.position;
	}

	try {
		if (bedPosition) {
			if (bot.entity.position.distanceTo(bedPosition) < 2) {
				bot.setControlState('forward', false);
				bed = bot.blockAt(bedPosition);
				bot.sleep(bed);
			} else {
				bot.lookAt(bedPosition);
				bot.setControlState('forward', true);
			}
		} else console.log(`Can't find bed.`);
	} catch(err) {
		console.log(err);
	}
}

async function depositLoop() {
	let chestBlock = bot.findBlock({
		matching: mcData.blocksByName['chest'].id,
	});

	if (!chestBlock) return;

	if (bot.entity.position.distanceTo(chestBlock.position) < 2) {
		bot.setControlState('forward', false);

		let chest = await bot.openChest(chestBlock);

		for (slot of bot.inventory.slots) {
			if (slot && slot.name == harvestName) {
				await chest.deposit(slot.type, null, slot.count);
			}
		}
		chest.close();
	} else {
		bot.lookAt(chestBlock.position);
		bot.setControlState('forward', true);
	}
}

async function farmLoop() {
	let harvest = readyCrop();

	if (harvest) {
		bot.lookAt(harvest.position);
		try {
			if (bot.entity.position.distanceTo(harvest.position) < 2) {
				bot.setControlState('forward', false);

				await bot.dig(harvest);
				if (!bot.heldItem || bot.heldItem.name != seedName) await bot.equip(mcData.itemsByName[seedName].id);

				let dirt = bot.blockAt(harvest.position.offset(0, -1, 0));
				await bot.placeBlock(dirt, vec3(0, 1, 0));
			} else {
				bot.setControlState('forward', true);
			}
		} catch(err) {
			console.log(err);
		}
	}
}

function readyCrop() {
	return bot.findBlock({
		matching: (blk)=>{
			return(blk.name == harvestName && blk.metadata == 7);
		}
	});
}