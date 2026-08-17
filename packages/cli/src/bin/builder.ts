#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { DocumentParseError, DocumentInvariantError } from "@vicolobuilder/engine";
import { runCreate } from "../core/createCommand.js";
import { runExport } from "../core/exportCommand.js";
import { runPublish } from "../core/publishCommand.js";

const USAGE = "uso: builder create <file> | builder export <file> | builder publish <file>";

function fail(message: string): never {
  console.error(`builder: ${message}`);
  process.exit(1);
}

const [command, target] = process.argv.slice(2);

if (!command) {
  fail(`comando mancante (${USAGE})`);
}
if (command !== "create" && command !== "export" && command !== "publish") {
  fail(`comando sconosciuto: "${command}" (${USAGE})`);
}
if (!target) {
  fail(`percorso file mancante (${USAGE})`);
}

const targetPath = resolve(process.cwd(), target);

if (command === "create") {
  try {
    writeFileSync(targetPath, runCreate(), "utf8");
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    fail(`impossibile scrivere "${target}": ${reason}`);
  }
} else {
  let rawJson: string;
  try {
    rawJson = readFileSync(targetPath, "utf8");
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    fail(`impossibile leggere "${target}": ${reason}`);
  }

  const run = command === "publish" ? runPublish : runExport;
  const verb = command === "publish" ? "pubblicare" : "esportare";

  try {
    process.stdout.write(run(rawJson) + "\n");
  } catch (error) {
    if (error instanceof DocumentParseError) {
      fail(`"${target}" non contiene un Document valido: ${error.message}`);
    }
    if (error instanceof DocumentInvariantError) {
      fail(`"${target}" viola un invariante del Document: ${error.message}`);
    }
    if (error instanceof RangeError) {
      // D-011 (DECISIONS.md): mitigazione approvata (Opzione 3) - cattura al
      // confine CLI, nessuna modifica ai punti ricorsivi dell'Engine. Un
      // grafo caricato da JSON esterno può essere profondo abbastanza da
      // esaurire lo stack durante validazione/risoluzione/layout.
      fail(`"${target}" non può essere elaborato: struttura troppo profonda per questo processo.`);
    }
    const reason = error instanceof Error ? error.message : String(error);
    fail(`impossibile ${verb} "${target}": ${reason}`);
  }
}
