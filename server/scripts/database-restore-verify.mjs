import "dotenv/config";
import { spawn } from "node:child_process";

const [dump] = process.argv.slice(2);
if (!dump || !process.env.RESTORE_VERIFY_DATABASE_URL) {
  throw new Error("Usage: RESTORE_VERIFY_DATABASE_URL=<empty disposable db> npm run db:restore:verify -- <dump-file>");
}
if (process.env.RESTORE_VERIFY_CONFIRM !== "DISPOSABLE_DATABASE") {
  throw new Error("Set RESTORE_VERIFY_CONFIRM=DISPOSABLE_DATABASE to confirm the target may be overwritten");
}
const args = ["--clean", "--if-exists", "--no-owner", "--no-acl", "--dbname", process.env.RESTORE_VERIFY_DATABASE_URL, dump];
const child = spawn("pg_restore", args, { stdio: "inherit", shell: false });
const code = await new Promise((resolve, reject) => { child.on("error", reject); child.on("exit", resolve); });
if (code !== 0) throw new Error(`pg_restore exited with ${code}`);
console.log("Restore completed. Run Prisma migration status and application smoke checks against the disposable database.");
