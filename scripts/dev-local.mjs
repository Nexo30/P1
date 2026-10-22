#!/usr/bin/env node
/**
 * Start the dev server without going through a shell shim.
 *
 * `npm run dev` spawns the bare command `vite`, which on Windows only resolves
 * through `vite.cmd`; a plain CreateProcess call reports ENOENT. Using Vite's
 * JS API skips that entirely, and the app-env merge stays where it belongs.
 */
import { spawn } from "node:child_process";
import { createServer } from "vite";
import { mergeAppEnv, projectRoot, readAppEnv } from "./with-app-env.mjs";

const HOST = "127.0.0.1";
const PORT = Number(process.env.PORT || 8080);

for (const [key, value] of Object.entries(mergeAppEnv(readAppEnv(projectRoot()), {}))) {
  process.env[key] ??= value;
}

const server = await createServer({
  root: projectRoot(),
  server: { host: HOST, port: PORT, strictPort: false },
});

await server.listen();
const url = `http://${HOST}:${server.config.server.port}/`;
console.log(`\n  La Torre lista en ${url}\n`);

if (!process.argv.includes("--no-open")) {
  if (process.platform === "win32") spawn("cmd", ["/c", "start", "", url], { stdio: "ignore" });
  else spawn("xdg-open", [url], { stdio: "ignore" });
}

for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => void server.close());
