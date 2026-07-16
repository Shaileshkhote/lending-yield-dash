import { spawn } from "node:child_process";

const ADAPTER_ALIASES: Record<string, string> = {
  aave: "aave-v3",
  "aave-v3": "aave-v3",
  "aave-v4": "aave-v4",
  spark: "spark",
  compound: "compound-v3",
  "compound-v3": "compound-v3",
  kamino: "kamino",
  morpho: "morpho-blue",
  "morpho-blue": "morpho-blue"
};

const args = process.argv.slice(2);
const adapter = args[0] ? ADAPTER_ALIASES[args[0].toLowerCase()] : undefined;

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});

async function main(): Promise<void> {
  if (adapter) {
    const date = args[1] ?? "latest";
    await run("pnpm", ["--filter", "@lendingscope/server", "history", "--", date], {
      HISTORY_ADAPTERS: adapter
    });
  } else {
    await run("pnpm", ["-r", "test:unit"]);
  }
}

function run(command: string, args: string[], env: Record<string, string> = {}): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      env: { ...process.env, ...env },
      stdio: "inherit"
    });

    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${command} ${args.join(" ")} exited with ${code ?? "unknown"}`));
      }
    });
  });
}
