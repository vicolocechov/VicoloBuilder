#!/usr/bin/env node
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { runCreate } from "../core/createCommand.js";

function fail(message: string): never {
  console.error(`builder: ${message}`);
  process.exit(1);
}

const [command, target] = process.argv.slice(2);

if (!command) {
  fail("comando mancante (uso: builder create <file>)");
}
if (command !== "create") {
  fail(`comando sconosciuto: "${command}" (atteso: "create")`);
}
if (!target) {
  fail("percorso file mancante (uso: builder create <file>)");
}

const outputPath = resolve(process.cwd(), target);

try {
  writeFileSync(outputPath, runCreate(), "utf8");
} catch (error) {
  const reason = error instanceof Error ? error.message : String(error);
  fail(`impossibile scrivere "${target}": ${reason}`);
}
