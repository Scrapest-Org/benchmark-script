import { loadEnv } from "./env";

const env = await loadEnv();

async function main() {
  console.log(`Setting up tracking for: ${env.testAccount}`);
  await Promise.all(
    env.vmConfigs.map(async (vm) => {
      const url = `${vm.httpUrl}/track`;
      try {
        const resp = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": env.myApiKey,
          },
          body: JSON.stringify({ sid: env.testAccount }),
        });
        if (resp.ok) {
          const json = await resp.json();
          console.log(`[${vm.name}] OK: ${JSON.stringify(json)}`);
        } else {
          console.log(
            `[${vm.name}] Failed (${resp.status}): ${await resp.text()}`,
          );
        }
      } catch (e: any) {
        console.log(`[${vm.name}] Error: ${e.message}`);
      }
    }),
  );
  console.log("Setup complete.");
}

main();
