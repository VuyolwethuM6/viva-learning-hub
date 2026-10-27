import { readFileSync, readdirSync, writeFileSync } from "node:fs";
const files = readdirSync("supabase/migrations")
  .filter((name) => name.startsWith("2026102716"))
  .sort();
const block =
  "\n-- BEGIN TEACHING FOUNDATION\n" +
  files
    .map((name) => readFileSync("supabase/migrations/" + name, "utf8"))
    .join("\n\n") +
  "\n-- END TEACHING FOUNDATION\n";
writeFileSync(
  "supabase/schema.sql",
  readFileSync("supabase/schema.sql", "utf8").split(
    "\n-- BEGIN TEACHING FOUNDATION",
  )[0] + block,
);
writeFileSync(
  "docs/teaching-setup.sql",
  "-- Complete teaching release 1 upgrade. Run ALL of this file after parent setup.\nbegin;\n" +
    block +
    "\ncommit;\n",
);
