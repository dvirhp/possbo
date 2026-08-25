import "dotenv/config";
import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import path from "node:path";

if (!process.env.DIRECT_URL) throw new Error("DIRECT_URL is required");
const directory = path.resolve(process.env.BACKUP_DIR || "backups");
await mkdir(directory, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const output = path.join(directory, `possbo-${stamp}.dump`);
const child = spawn("pg_dump", ["--format=custom", "--no-owner", "--no-acl", "--file", output, process.env.DIRECT_URL], { stdio: "inherit", shell: false });
const code = await new Promise((resolve, reject) => { child.on("error", reject); child.on("exit", resolve); });
if (code !== 0) throw new Error(`pg_dump exited with ${code}`);
console.log(`Backup created: ${output}`);
