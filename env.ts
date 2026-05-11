export interface EnvConfig {
  vmConfigs: Array<{ name: string; httpUrl: string }>;
  barkWsUrl: string;
  barkApiKey: string;
  myApiKey: string;
  testAccount: string;
  redisUrl: string | null;
  vmName: string;
}

const VM_MAP: Array<{ key: string; name: string }> = [
  { key: "VM_US_EAST1", name: "us-east1" },
  { key: "VM_US_EAST4", name: "us-east4" },
  { key: "VM_US_WEST1", name: "us-west1" },
  { key: "VM_EU_WEST2", name: "eu-west2" },
  { key: "VM_EU_CENT2", name: "eu-central2" },
];

export async function loadEnv(): Promise<EnvConfig> {
  const text = await Bun.file("benchmark.env").text();
  const env: Record<string, string> = {};
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    env[trimmed.slice(0, eqIdx).trim()] = trimmed.slice(eqIdx + 1).trim();
  }

  const required = [
    "VM_US_EAST1",
    "VM_US_EAST4",
    "VM_US_WEST1",
    "VM_EU_WEST2",
    "VM_EU_CENT2",
    "BARK_WS_URL",
    "BARK_API_KEY",
    "MY_API_KEY",
    "TEST_ACCOUNT",
  ];
  for (const key of required) {
    if (!env[key]) {
      console.error(`Missing required env var: ${key}`);
      process.exit(1);
    }
  }

  if (env.REDIS_URL) process.env.REDIS_URL = env.REDIS_URL;

  return {
    vmConfigs: VM_MAP.map((m) => ({ name: m.name, httpUrl: env[m.key] })),
    barkWsUrl: env.BARK_WS_URL,
    barkApiKey: env.BARK_API_KEY,
    myApiKey: env.MY_API_KEY,
    testAccount: env.TEST_ACCOUNT,
    redisUrl: env.REDIS_URL ?? null,
    vmName: env.VM_NAME ?? "default",
  };
}
