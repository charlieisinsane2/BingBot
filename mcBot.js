import mineflayer from "mineflayer";
import { pathfinder, Movements, goals } from "mineflayer-pathfinder";
import mcDataFactory from "minecraft-data";
import Vec3 from "vec3";
import { setupCombat } from "./combat.js";
import fs from "fs";

export async function createBotController({ username, host, port = 25565, cfg }) {
  const bot = mineflayer.createBot({
    host,
    port,
    username,
    auth: "offline",
    version: false // autodetect; set specific version if needed
  });

  bot.loadPlugin(pathfinder);

  const mcData = mcDataFactory(bot.version);
  const movements = new Movements(bot, mcData);

  const metadata = {
    name: username,
    mode: "aggressive",
    arenaSpawn: cfg?.arenaSpawn || { x: 0, y: 64, z: 0 },
    edgeDistance: cfg?.edgeDistance || 2.2
  };

  const controller = {
    bot,
    metadata,
    isConnected: false,
    mode: metadata.mode,
    async connectToServer(newHost, newPort = 25565) {
      try {
        bot.quit();
      } catch(e){}
      // spawn replacement bot with same username
      return new Promise((resolve) => {
        setTimeout(async () => {
          const newController = await createBotController({ username: metadata.name, host: newHost, port: newPort, cfg });
          resolve(newController);
        }, 1500);
      });
    },
    stopAll() {
      try { bot.clearControlStates(); } catch(e){}
      // remove combat target if any
      if (bot._sumoCombat) {
        bot._sumoCombat.stop();
        delete bot._sumoCombat;
      }
    },
    quit() {
      try { bot.quit(); } catch (e) {}
    },
    setMode(m) {
      metadata.mode = m;
      this.mode = m;
    }
  };

  bot.once("spawn", () => {
    console.log(`[MC:${username}] spawned on ${host}:${port} (ver:${bot.version})`);
    bot.chat(`Hello! ${username} online.`);
    // set movements for pathfinder
    bot.pathfinder.setMovements(movements);
    // attach combat AI
    bot._sumoCombat = setupCombat(bot, metadata);
    controller.isConnected = true;
  });

  bot.on("end", () => {
    console.log(`[MC:${username}] disconnected`);
    controller.isConnected = false;
  });

  bot.on("error", (err) => {
    console.log(`[MC:${username}] error:`, err && err.message ? err.message : err);
  });

  return controller;
}
