import { ValidatorReport } from "./types.js";

export function printHuman(report: ValidatorReport) {
  const pad = (s: string, n = 22) => (s + "...").padEnd(n, ".");
  console.log(`Validator — mode=${report.mode}, sha=${report.sha}`);
  console.log(`DB: ${report.dbPath}`);
  if (report.dataDir) console.log(`Data dir: ${report.dataDir}`);
  console.log("");

  // ASCII
  console.log("[ASCII]");
  console.log(`  ${pad("rows")}${report.ascii.rows}`);
  console.log(
    `  ${pad("invalid")}${report.ascii.invalid}${report.ascii.invalid === 0 ? "  ✅" : "  ❌"}`
  );
  console.log(
    `  ${pad("min/avg/max length")}${
      report.ascii.minLen ?? "-"
    } / ${report.ascii.avgLen ?? "-"} / ${report.ascii.maxLen ?? "-"}`
  );
  if (report.ascii.invalid > 0 && report.ascii.examples?.length) {
    for (const ex of report.ascii.examples) {
      console.log(
        `  example invalid id=${ex.id} reason=${ex.reason} sample="${ex.sample}"`
      );
    }
  }
  console.log("");

  // BINARY
  console.log("[BINARY]");
  console.log(`  ${pad("rows")}${report.binary.rows}`);
  console.log(
    `  ${pad("files missing")}${report.binary.filesMissing}${
      report.binary.filesMissing === 0 ? "  ✅" : "  ❌"
    }`
  );
  console.log(
    `  ${pad("size mismatches")}${report.binary.sizeMismatch}${
      report.binary.sizeMismatch === 0 ? "  ✅" : "  ❌"
    }`
  );
  if (report.sha === "verify") {
    console.log(
      `  ${pad("checksum mismatches")}${report.binary.checksumMismatch}${
        report.binary.checksumMismatch === 0 ? "  ✅" : "  ❌"
      }`
    );
    console.log(
      `  ${pad("sampled for checksum")}${report.binary.sampledForChecksum}`
    );
  } else {
    console.log(`  ${pad("checksum")}(skipped)`);
  }
  console.log(
    `  ${pad("min/avg/max bytes")}${
      report.binary.minBytes ?? "-"
    } / ${report.binary.avgBytes ?? "-"} / ${report.binary.maxBytes ?? "-"}`
  );
  console.log("");

  // Cross
  console.log("[CROSS]");
  console.log(`  ${pad("total messages")}${report.cross.totalMessages}`);
  if (report.cross.meetsExpectedMin !== null) {
    console.log(
      `  ${pad(`>= expected min (${report.cross.expectedMin})`)}${
        report.cross.meetsExpectedMin ? "yes ✅" : "no ❌"
      }`
    );
  }
  if (typeof report.cross.badFramesCount === "number") {
    const pct =
      report.cross.badFramesRatio != null
        ? ` (${(report.cross.badFramesRatio * 100).toFixed(2)}%)`
        : "";
    console.log(`  ${pad("bad_frames")}${report.cross.badFramesCount}${pct}`);
  }

  console.log("");
  console.log(report.pass ? "PASS ✅" : "FAIL ❌");
}
