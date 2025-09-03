import readline from "readline";
import { createBotController } from "./mcBot.js";
import fs from "fs";

const cfg = JSON.parse(fs.readFileSync("./config.json", "utf8"));

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  prompt: "> "
});

console.log("SumoBot terminal controller");
console.log("Commands: spawn <name?> <host> <port?> | connect <name> <host> <port?> | command <name> <text...> | list | stop <name> | quit");
rl.prompt();

const controllers = new Map(); // name -> controller

rl.on("line", async (line) => {
  const parts = line.trim().split(/\s+/);
  const cmd = parts.shift();
  if (!cmd) { rl.prompt(); return; }

  try {
    if (cmd === "spawn") {
      // spawn [name] [host] [port]
      let name = parts[0] && !parts[0].includes(":") ? parts.shift() : undefined;
      const host = parts.shift() || cfg.defaultHost;
      const port = Number(parts.shift() || cfg.defaultPort);
      const uname = name || `${cfg.botNamePrefix}_${Math.floor(Math.random()*10000)}`;
      if (controllers.has(uname)) {
        console.log("A bot with that name already exists.");
      } else {
        const controller = await createBotController({ username: uname, host, port, cfg });
        controllers.set(uname, controller);
        console.log(`Spawned ${uname} -> ${host}:${port}`);
      }
    } else if (cmd === "connect") {
      // connect <name> <host> [port]
      const name = parts.shift();
      const host = parts.shift();
      const port = Number(parts.shift() || cfg.defaultPort);
      const controller = controllers.get(name);
      if (!controller) { console.log("Unknown bot:", name); }
      else {
        await controller.connectToServer(host, port);
        console.log(`${name} connecting to ${host}:${port}`);
      }
    } else if (cmd === "command") {
      // command <name> <text...>
      const name = parts.shift();
      const controller = controllers.get(name);
      if (!controller) { console.log("Unknown bot:", name); }
      else {
        const text = parts.join(" ");
        controller.bot.chat(text);
        console.log(`[${name}] -> ${text}`);
      }
    } else if (cmd === "list") {
      if (controllers.size === 0) console.log("(no bots)");
      else {
        for (const [k, v] of controllers) {
          console.log(k, "connected:", v.isConnected ? "yes" : "no", "mode:", v.mode);
        }
      }
    } else if (cmd === "stop") {
      const name = parts.shift();
      const controller = controllers.get(name);
      if (!controller) { console.log("Unknown bot:", name); }
      else {
        controller.stopAll();
        console.log(`Stopped ${name}`);
      }
    } else if (cmd === "quit" || cmd === "exit") {
      console.log("Quitting — disconnecting bots...");
      for (const [k, v] of controllers) {
        try { v.quit(); } catch (e) {}
      }
      process.exit(0);
    } else {
      console.log("Unknown command.");
    }
  } catch (err) {
    console.error("Error:", err && err.message ? err.message : err);
  }

  rl.prompt();
});
