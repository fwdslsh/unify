// Runs BEFORE the build: node _scripts/gen-menu.mjs && unify build
// Writes generated pages into the source tree, where they are ordinary source.
import { writeFileSync } from "node:fs";
writeFileSync(new URL("../menu/seasonal.html.example", import.meta.url), "<!-- generated -->\n");
