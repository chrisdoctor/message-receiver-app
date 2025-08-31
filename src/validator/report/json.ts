import fs from "fs";
import { ValidatorReport } from "./types.js";

export async function writeJsonReport(path: string, report: ValidatorReport) {
  const json = JSON.stringify(report, null, 2);
  await fs.promises.writeFile(path, json, "utf8");
}
