// Development artifact generator/checker. Does not connect to any database.
import { readFileSync, writeFileSync } from "node:fs";
const names = [
  "20261111030000_recruitment_applicants",
  "20261111040000_recruitment_documents_submissions",
  "20261111050000_recruitment_case_operations",
  "20261111060000_recruitment_runtime_guards",
];
const blocks = names
  .map(
    (n) =>
      "-- BEGIN " +
      n +
      "\n" +
      readFileSync("supabase/migrations/" + n + ".sql", "utf8") +
      "\n-- END " +
      n +
      "\n",
  )
  .join("\n");
const schema = "supabase/schema.sql",
  bundle = "docs/recruitment/milestone-3/migration.sql";
const prefix = readFileSync(schema, "utf8")
  .split("-- BEGIN " + names[0])[0]
  .trimEnd();
const artifacts = {
  [schema]: prefix + "\n\n" + blocks,
  [bundle]:
    "-- REVIEW PACKAGE ONLY. Requires corrected M3.1 and M2 dependencies. No production execution authorized.\nbegin;\n" +
    blocks +
    "\nnotify pgrst,'reload schema';\ncommit;\n",
};
for (const [path, content] of Object.entries(artifacts)) {
  if (process.argv.includes("--check")) {
    if (readFileSync(path, "utf8") !== content)
      throw Error("Out-of-date artifact: " + path);
  } else writeFileSync(path, content);
}
console.log(
  process.argv.includes("--check")
    ? "M3 SQL artifacts match canonical migrations."
    : "M3 review artifacts updated. No database action.",
);
