export interface EnvConfig {
  vmConfigs: Array<{ name: string; httpUrl: string }>;
  barkWsUrl: string;
  barkApiKey: string;
  myApiKey: string;
  testAccount: string;
  vmName: string;
}

const VM_MAP: Array<{ key: string; name: string }> = [
  { key: "VM_US_EAST1", name: "us-east1" },
  { key: "VM_US_EAST4", name: "us-east4" },
  { key: "VM_US_WEST1", name: "us-west1" },
  { key: "VM_EU_WEST2", name: "eu-west2" },
  { key: "VM_EU_CENT2", name: "eu-central2" },
];

export function loadEnv(): EnvConfig {
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
    if (!process.env[key]) {
      console.error(`Missing required env var: ${key}`);
      process.exit(1);
    }
  }

  return {
    vmConfigs: VM_MAP.map((m) => ({ name: m.name, httpUrl: process.env[m.key]! })),
    barkWsUrl: process.env.BARK_WS_URL!,
    barkApiKey: process.env.BARK_API_KEY!,
    myApiKey: process.env.MY_API_KEY!,
    testAccount: process.env.TEST_ACCOUNT!,
    vmName: process.env.VM_NAME ?? "default",
  };
}
