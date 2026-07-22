// VentureOS — Demo Mode · Feature flag
// ====================================
// Demo Mode is DISABLED by default. It is enabled only when the public env flag
// `NEXT_PUBLIC_VENTUREOS_DEMO_MODE` is exactly the string "true". Any other value
// (absent, "false", "1", "yes") leaves the route hidden and returns not-found.
// No public navigation ever links to it.

export interface DemoModeEnv {
  NEXT_PUBLIC_VENTUREOS_DEMO_MODE?: string;
}

export function isDemoModeEnabled(env: DemoModeEnv): boolean {
  return env.NEXT_PUBLIC_VENTUREOS_DEMO_MODE === "true";
}
