import { spawn } from "child_process";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const INTERVAL_MS = 30 * 60 * 1000; // 30 minutes

function timestamp() {
  return new Date().toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

function runAgent(): Promise<void> {
  return new Promise((resolve) => {
    console.log(`\n[${timestamp()}] 🚀 Starting agent run...`);

    const child = spawn("bun", ["index.ts"], {
      cwd: __dirname,
      stdio: "inherit",
      env: process.env,
    });

    child.on("close", (code) => {
      if (code === 0) {
        console.log(`\n[${timestamp()}] ✅ Run complete. Next run in 30 minutes.`);
      } else {
        console.error(`\n[${timestamp()}] ❌ Run failed (exit ${code}). Retrying next interval.`);
      }
      resolve();
    });
  });
}

console.log("🗓️  X Feed Scheduler started — running every 30 minutes");
console.log("   Press Ctrl+C to stop.\n");

// Run immediately on start, then every 30 minutes
await runAgent();

setInterval(async () => {
  await runAgent();
}, INTERVAL_MS);
