// Read-only local preflight: no provider API, credentials, SQL or deployment.
import ts from "typescript";
import { readdirSync } from "node:fs";
import { join } from "node:path";

function entrypoints(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name.startsWith("_") || entry.name.startsWith(".")) return [];
    const path = join(directory, entry.name);
    return entry.isDirectory()
      ? entrypoints(path)
      : /\.(?:[cm]?[jt]s|tsx)$/.test(entry.name) &&
          !entry.name.endsWith(".d.ts")
        ? [path]
        : [];
  });
}
const rootNames = entrypoints("api");
if (rootNames.length > 12)
  throw Error(
    `Hobby deployment function budget exceeded: ${rootNames.length}/12`,
  );
const source = ts.readConfigFile("tsconfig.json", ts.sys.readFile);
if (source.error)
  throw Error(ts.flattenDiagnosticMessageText(source.error.messageText, "\n"));
// Vercel compiles from the root tsconfig, without following solution references.
const config = ts.parseJsonConfigFileContent(
  source.config,
  ts.sys,
  process.cwd(),
  { noEmit: true },
);
const program = ts.createProgram({ rootNames, options: config.options });
const diagnostics = [...config.errors, ...ts.getPreEmitDiagnostics(program)];
if (diagnostics.length) {
  console.error(
    ts.formatDiagnosticsWithColorAndContext(diagnostics, {
      getCurrentDirectory: () => process.cwd(),
      getCanonicalFileName: (name) => name,
      getNewLine: () => "\n",
    }),
  );
  process.exitCode = 1;
} else
  console.log(
    `Vercel root-config API check passed: ${rootNames.length}/12 function entries; zero TypeScript diagnostics.`,
  );
