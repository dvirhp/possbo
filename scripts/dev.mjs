import { spawn } from "node:child_process";

const npmCommand = process.platform === "win32" ? "npm" : "npm";

function run(label, args) {
  const child = spawn(`${npmCommand} ${args.join(" ")}`, {
    stdio: "inherit",
    shell: true,
  });

  child.on("exit", (code, signal) => {
    if (signal) {
      console.log(`${label} stopped with signal ${signal}`);
      return;
    }

    if (code && code !== 0) {
      console.error(`${label} exited with code ${code}`);
      shutdown(code);
    }
  });

  child.on("error", (error) => {
    console.error(`${label} failed:`, error.message);
    shutdown(1);
  });

  return child;
}

const server = run("server", ["--prefix", "server", "run", "dev"]);
const client = run("client", ["--prefix", "client", "run", "dev"]);

let shuttingDown = false;

function shutdown(exitCode = 0) {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;

  for (const child of [server, client]) {
    if (!child.killed) {
      child.kill("SIGTERM");
    }
  }

  setTimeout(() => process.exit(exitCode), 200);
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));
