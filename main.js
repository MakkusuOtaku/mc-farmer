const mineflayer = require('mineflayer');
const pathfinder = require("./pathfinder.js");
const vec3 = require('vec3');

const BED_TIME = 12000;

let cropType = 'wheat_seeds'
let seedName = 'wheat_seeds';
let harvestName = 'wheat';

let expansion = 0;
let snackTime = false;

const bot = mineflayer.createBot({
	username: "FarmMachine",
	host: "localhost",
	port: 12345,
	//viewDistance: "tiny",
});

let bedPosition;
let chestPosition;
let mcData;

bot.on('kicked', (reason, loggedIn) => console.log(reason, loggedIn));
bot.on('error', err => console.log(err));

bot.once('spawn', async ()=>{
	mcData = require('minecraft-data')(bot.version);
	bot.chat(`I'm a happy little robot. (${bot.game.gameMode})`);

	let farmBlocks = bot.findBlock({
		matching: (block)=>{
			return block.name === "farmland";
		},
	});

	/*if (!farmBlocks) {
		console.log("Waiting for command to start.");
		return;
	}*/

	console.log("Entering main loop.");
	mainLoop();
});

bot.on('chat', async (username, message)=>{
	let tokens = message.split(' ');

	switch(tokens[0]) {
		case 'bed':
			bedPosition = vec3(parseInt(tokens[1]), parseInt(tokens[2]), parseInt(tokens[3]));
			break;
		case 'chest':
			chestPosition = vec3(parseInt(tokens[1]), parseInt(tokens[2], parseInt(tokens[3])));
			break;
		case 'eat':
			snackTime = true;//takeSnackBreak();
			break;
		case 'expand':
			if (tokens.length === 1) {
				expansion += 1;
			} else {
				let loops = parseInt(tokens[1]);
				expansion += loops;
			}
			break;
		case 'hoe':
			getHoe();
			break;
		case 'seeds':
			for (let i = 0; i < 10; i++) {
				await getSeeds();
			}
			break;
		case 'start':
			console.log("Starting a new farm. Wish me luck!");
			await startFarm();
			mainLoop();
			break;
	}
});

async function mainLoop() {
	while (true) {
		if (bot.time.timeOfDay > BED_TIME) await sleepInBed();
		if (bot.inventory.slots.filter(v=>v==null).length < 11) await depositLoop();
		if (bot.food <= 10 || snackTime) await takeSnackBreak();
		
		await harvestCrops();
		await fillFarmland();
		if (expansion) {
			await expandFarm();
			expansion -= 1;
		}

		await bot.waitForTicks(1);
	}
}

// This is still used as a dumb fall back in case the pathfinder fails.
async function oldGoto (position, range=2) {
	/*while (bot.entity.position.distanceTo(position) > range) {
		bot.lookAt(position);
		bot.setControlState('forward', true);

		bot.setControlState('sprint', (bot.entity.position.distanceTo(position) > 3));

		bot.setControlState('jump', bot.entity.isCollidedHorizontally);

		await bot.waitForTicks(1);
	}*/

	bot.lookAt(position);
	bot.setControlState('forward', true);
	bot.setControlState('sprint', (bot.entity.position.distanceTo(position) > 3));
	bot.setControlState('jump', bot.entity.isCollidedHorizontally);
	await bot.waitForTicks(1);

	//bot.setControlState('forward', false);
};

bot.goto = async (target, range=2)=>{
    let botPosition = bot.entity.position;
    let path;// = pathfinder.path(bot, bot.entity.position, target, range);

    while (botPosition.distanceTo(target) > range) {
        path = pathfinder.path(bot, botPosition, target, range);

        //if (!path || !path.length) console.log(querty);
        //await bot.waitForTicks(1);

        if (!path || !path.length) {
        	console.log(`Couldn't find path. ${bot.entity.position.distanceTo(target)} : ${range}`);
        	await oldGoto(target, range);
        	botPosition = bot.entity.position;
        	//await bot.waitForTicks(1);
        	continue;
        }

        let step = path[path.length-1];
        pathfinder.walk(bot, step.position);

        await bot.waitForTicks(1);

        botPosition = bot.entity.position;
    }

    bot.clearControlStates();
};

const sideVectors = [
	[ 0, 0, 1],
	[ 0, 0,-1],
	[ 1, 0, 0],
	[-1, 0, 0],

	[ 0, 1, 1],
	[ 0, 1,-1],
	[ 1, 1, 0],
	[-1, 1, 0],

	[ 0,-1, 1],
	[ 0,-1,-1],
	[ 1,-1, 0],
	[-1,-1, 0],
];

function checkValidOpen(block) {
	if (!block) return false;
	if (block.name === "farmland") return false;
	if (block.name !== "dirt" && block.name !== "grass_block") return false;

	let topBlock = bot.blockAt(block.position.offset(0, 1, 0));

	if (topBlock.name !== "air" && topBlock.name !== "cave_air") return false;

	return true;
}

async function findEdges() {
	let farmBlocks = await bot.findBlocks({
		matching: (block)=>{
			return block.name === "farmland";
		},
		count: 256,
		maxDistance: 32,
	});

	let openList = [];

	for (block of farmBlocks) {
		for (side of sideVectors) {
			let sideBlock = bot.blockAt(block.offset(...side));

			if (sideBlock && checkValidOpen(sideBlock)) {
				openList.push(sideBlock.position);
			}
		}
	}

	return openList;
}

async function expandFarm() {
	let openList = await findEdges();

	while (openList.length > 0) {
		let position = openList.reduce((best, item)=>{
			if (!best) return item;
			return item.distanceTo(bot.entity.position) < best.distanceTo(bot.entity.position)? item : best;
		}, null);

		let index = openList.indexOf(position);
		openList.splice(index, 1);

		if (!checkInventory("wooden_hoe")) await getHoe();
		if (!bot.heldItem || bot.heldItem.name != "wooden_hoe") await bot.equip(mcData.itemsByName["wooden_hoe"].id);

		await bot.goto(position);

		let dirt = bot.blockAt(position);
		await bot.activateBlock(dirt, vec3(0, 1, 0)).catch(console.log);

		await bot.waitForTicks(1);

		// Plant seeds on dirt
		if (!checkInventory("wheat_seeds")) await getSeeds();
		if (!bot.heldItem || bot.heldItem.name !== seedName) await bot.equip(mcData.itemsByName[seedName].id).catch(console.log);

		await bot.goto(position);
		await bot.activateBlock(dirt, vec3(0, 1, 0)).catch(console.log);
	}

	bot.chat("Edges!");
}

function checkInventory(itemName) {
    let items = bot.inventory.items();
    return items.filter(item => item.name === itemName).length;
}

async function getSeeds() {
	if (checkInventory(seedName) >= 1) return;

	while (true) {
		let grassBlock = bot.findBlock({
			matching: block=>{
				if (block.name === harvestName && block.metadata === 7) return true;
				return block.name === "grass" || block.name === "tall_grass";
			},
		});

		if (!grassBlock) {
			console.log("Couldn't find grass.");
			return;
		}

		await bot.goto(grassBlock.position, 1.5);

		await bot.dig(grassBlock);

		bot.waitForTicks(1);
		
		// Look for an item entity with ID of 619 (wheat_seeds)
		let itemEntity = bot.nearestEntity((entity)=>{
			return entity.name === 'item' && entity.metadata[7].itemId === 619;
		});

		if (!itemEntity) continue;

		await bot.goto(itemEntity.position);
		await bot.waitForTicks(1);

		if (checkInventory(seedName)) {
			console.log("Found seeds.");
			return;
		}
	}
}


async function getWood(amount=1) {
	const logsList = [
		mcData.itemsByName["oak_log"].id,
		mcData.itemsByName["dark_oak_log"].id,
		mcData.itemsByName["birch_log"].id
	];

	let woodBlocks = bot.findBlocks({
		matching: block=>{
			return block.name === "oak_log";
		},
		count: amount,
	});

	if (!woodBlocks.length) {
		console.log("Couldn't find a tree.");
		return;
	}

	for (woodPosition of woodBlocks) {
		let woodBlock = bot.blockAt(woodPosition);
		await bot.goto(vec3(woodPosition.x, bot.entity.position.y, woodPosition.z));

		await bot.dig(woodBlock);

		await bot.waitForTicks(1);

		let itemEntity = bot.nearestEntity((entity)=>{
			return entity.name === 'item' && entity.entityType === mcData.itemsByName["oak_log"].id;
		});

		if (!itemEntity || bot.entity.position.distanceTo(itemEntity.position) > 5) continue;

		console.log(`Item found at ${
			vec3(itemEntity.position.x, bot.entity.position.y, itemEntity.position.z)
		}!`);

		await bot.waitForTicks(10); // I don't know if this'll help.

		await bot.goto(vec3(itemEntity.position.x, bot.entity.position.y, itemEntity.position.z), 1);
		await bot.waitForTicks(1);
	}
}

async function craftHoe() {
	let hoe_id = mcData.itemsByName['wooden_hoe'].id;

	let table = bot.findBlock({
		matching: (block)=>{
			return block.name === "crafting_table";
		},
		maxDistance: 4,
	});

	if (!table) {
		console.log("Couldn't find a table.");
		return;
	}

	let recipe = bot.recipesFor(hoe_id, null, 1, table)[0];

	if (!recipe) {
		console.log("Couldn't find a recipe.");
		return;
	}

	await bot.craft(recipe, 1, table);

	console.log("Made hoe.");
}

async function getHoe() {
	let planksID = mcData.itemsByName['oak_planks'].id;
	let stickID = mcData.itemsByName['stick'].id;
	let tableID = mcData.itemsByName['crafting_table'].id;
	let hoeID = mcData.itemsByName['wooden_hoe'].id;

	await getWood(4);

	console.log("Found wood!");

	// Craft wooden planks.
	let planksRecipes = bot.recipesFor(planksID, null, 1, null);
	await bot.craft(planksRecipes[0], 3, null);

	console.log("Crafted planks!");

	// Craft sticks.
	let stickRecipes = bot.recipesFor(stickID, null, 1, null);
	await bot.craft(stickRecipes[0], 1, null);

	console.log("Crafted sticks!");

	// Craft crafting table.
	let tableRecipes = bot.recipesFor(tableID, null, 1, null);
	await bot.craft(tableRecipes[0], 1, null);

	console.log("Made a table!");

	// Find somewhere to put the crafting table.
	let solidBlocks = bot.findBlocks({
		matching: (block)=>{
			return block.name !== "air" && block.name !== "cave_air";
		},
		count: 64,
		maxDistance: 10,
	});

	let craftingSpot;

	for (position of solidBlocks) {
		let block = bot.blockAt(position);
		let topBlock = bot.blockAt(block.position.offset(0, 1, 0));

		if (topBlock.name !== "air" && topBlock.name !== "cave_air") continue;
		if (bot.entity.position.xzDistanceTo(position) <= 2) continue;

		craftingSpot = block;
		break;
	}

	// Place the crafting table.
	if (!craftingSpot) console.log("Couldn't find somewhere to put the crafting table.");

	let tablePosition = craftingSpot.position;

	await bot.equip(mcData.itemsByName["crafting_table"].id);
	await bot.goto(tablePosition, 4);
	await bot.placeBlock(craftingSpot, {x: 0, y: 1, z: 0}).catch(console.log);

	console.log("Placed the table! (maybe)");

	await bot.waitForTicks(1);

	await craftHoe();
	await bot.waitForTicks(1);
	await bot.equip(hoeID);
	console.log("Equiped the hoe!");
}

async function sleepInBed() {
	let bed = bot.findBlock({
		matching: block=>bot.isABed(block),
	});

	if (!bed) {
		console.log("Couldn't find bed.");
		return;
	}

	await bot.goto(bed.position);

	await bot.sleep(bed);
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

async function harvestCrops() {
	let harvest = readyCrop();

	if (!harvest) return;

	await bot.goto(harvest.position);

	await bot.dig(harvest);

	await bot.waitForTicks(1);

	let itemEntity = bot.nearestEntity((entity)=>{
		return entity.name.toLowerCase() === 'item'
	});

	if (itemEntity) {
		await bot.goto(itemEntity.position);
		await bot.waitForTicks(1);
	}

	if (!bot.heldItem || bot.heldItem.name != seedName) {
		await getSeeds();
		await bot.equip(mcData.itemsByName[seedName].id);
	}

	let dirt = bot.blockAt(harvest.position.offset(0, -1, 0));
	await bot.activateBlock(dirt, vec3(0, 1, 0)).catch(console.log);
}

async function fillFarmland() {
	let farmBlocks = await bot.findBlocks({
		matching: (block)=>{
			return block.name === "farmland";
		},
		count: 256,
		maxDistance: 64,
	});

	let vacant = farmBlocks.find(position=>{
		let topBlock = bot.blockAt(position.offset(0, 1, 0));
		return topBlock.name === "air" || topBlock.name === "cave_air";
	});

	if (!vacant) return;

	await bot.goto(vacant);

	if (!bot.heldItem || bot.heldItem.name != seedName) await bot.equip(mcData.itemsByName[seedName].id);

	await bot.activateBlock(bot.blockAt(vacant), vec3(0, 1, 0)).catch(console.log);
}

function readyCrop() {
	return bot.findBlock({
		matching: (blk)=>{
			return(blk.name == harvestName && blk.metadata == 7);
		}
	});
}

async function takeSnackBreak() {
	let bread_id = mcData.itemsByName['bread'].id;
	snackTime = false;

	let table = bot.findBlock({
		matching: (block)=>{
			return block.name === "crafting_table";
		},
	});

	if (!table) {
		console.log("Couldn't find a table.");
		return;
	}

	await bot.goto(table.position);

	let recipe = bot.recipesFor(bread_id, null, 1, table)[0];

	if (!recipe) {
		console.log("Couldn't find a recipe.");
		return;
	}

	await bot.craft(recipe, 1, table);

	console.log("Made bread.");

	if (bot.food === 20) {
		console.log(`Too full to eat.`);
		return;
	}

	await bot.equip(bread_id);
	await bot.consume();

	console.log("Ate bread.");
}

async function startFarm() {
	let blocks = bot.findBlocks({
		matching: (block)=>{
			return block.name === "grass_block" || block.name === "dirt";
		},
		count: 256,
		maxDistance: 20,
	});

	console.log(`Total blocks found: ${blocks.length}`);

	let farmPosition = blocks.find((position)=>{

		if (bot.entity.position.distanceTo(position) < 2) return false;

		let topBlock = bot.blockAt(position.offset(0, 1, 0));
		if (topBlock.name !== 'air') return false;

		let topestBlock = bot.blockAt(position.offset(0, 2, 0));
		if (topestBlock.name !== 'air') return false;

		return true;
	});

	if (!farmPosition) return false;
	console.log(`Bot: ${bot.entity.position}`);
	console.log(`Farm: ${farmPosition}`);

	if (!checkInventory("wooden_hoe")) await getHoe();
	if (!bot.heldItem || bot.heldItem.name != "wooden_hoe") await bot.equip(mcData.itemsByName["wooden_hoe"].id);

	await bot.goto(farmPosition);

	let dirt = bot.blockAt(farmPosition);
	await bot.activateBlock(dirt, vec3(0, 1, 0)).catch(console.log);

	await bot.waitForTicks(1);

	// Plant seeds on dirt
	if (!checkInventory("wheat_seeds")) await getSeeds();
	if (!bot.heldItem || bot.heldItem.name !== seedName) await bot.equip(mcData.itemsByName[seedName].id).catch(console.log);

	await bot.goto(farmPosition);
	await bot.activateBlock(dirt, vec3(0, 1, 0)).catch(console.log);

	return true;

}