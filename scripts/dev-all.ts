import { spawn } from "bun";

console.log("Starting EureClaw + Web UI...\n");

const eureclaw = spawn(["bun", "start"], {
  stdio: ["inherit", "inherit", "inherit"],
  cwd: import.meta.dir + "/..",
});

const webui = spawn(["bun", "run", "dev"], {
  stdio: ["inherit", "inherit", "inherit"],
  cwd: import.meta.dir + "/../web-ui",
});

process.on("SIGINT", () => {
  eureclaw.kill();
  webui.kill();
  process.exit(0);
});

await Promise.all([eureclaw.exited, webui.exited]);
