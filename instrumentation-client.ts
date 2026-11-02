import { config } from "zod";

// Next runs this before application modules/hydration. Zod's interpreted parser
// preserves validation while avoiding its eval probe and Function-based JIT.
config({ jitless: true });
