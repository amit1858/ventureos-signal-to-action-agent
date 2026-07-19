// Registers the deterministic-eval TypeScript loader. Use with:
//   node --import ./register.mjs ./memoryCore.eval.ts
import { register } from "node:module";

register("./ts-loader.mjs", import.meta.url);
