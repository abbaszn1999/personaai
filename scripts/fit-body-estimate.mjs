// Refits the chest/waist-from-height-and-weight coefficients in
// src/modules/wearable-agent/utils/body-estimate.ts to the public ANSUR II survey.
//
//   node scripts/fit-body-estimate.mjs
//
// Downloads the two public CSVs (US Army Anthropometric Survey 2012, cleared for unlimited public
// release) into the OS temp dir, fits  cm = intercept + b1 * BMI + b2 * height  per sex, reports
// accuracy on a deterministic 20% hold-out, and prints the coefficients to paste into the file.
// Units in the source files: stature, circumferences in mm; "weightkg" is in hectograms.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const SOURCES = {
  man: "https://raw.githubusercontent.com/cfgranda/ps4ds/main/data/ANSUR%20II%20MALE%20Public.csv",
  woman: "https://raw.githubusercontent.com/cfgranda/ps4ds/main/data/ANSUR%20II%20FEMALE%20Public.csv",
};
const dir = path.join(os.tmpdir(), "ansur2");
fs.mkdirSync(dir, { recursive: true });

async function load(sex) {
  const file = path.join(dir, `${sex}.csv`);
  if (!fs.existsSync(file)) {
    const res = await fetch(SOURCES[sex]);
    if (!res.ok) throw new Error(`Download failed for ${sex}: ${res.status}`);
    fs.writeFileSync(file, Buffer.from(await res.arrayBuffer()));
  }
  const text = new TextDecoder("windows-1252").decode(fs.readFileSync(file));
  const [head, ...lines] = text.split(/\r?\n/).filter(Boolean);
  const cols = head.split(",").map((c) => c.replace(/^"|"$/g, "").trim());
  const idx = Object.fromEntries(cols.map((c, i) => [c, i]));
  const rows = [];
  for (const line of lines) {
    const f = line.split(",");
    const heightCm = Number(f[idx.stature]) / 10;
    const weightKg = Number(f[idx.weightkg]) / 10;
    const chestCm = Number(f[idx.chestcircumference]) / 10;
    const waistCm = Number(f[idx.waistcircumference]) / 10;
    if (![heightCm, weightKg, chestCm, waistCm].every(Number.isFinite)) continue;
    // The same adult range the onboarding form estimates inside.
    if (heightCm < 120 || heightCm > 220 || weightKg < 30 || weightKg > 180) continue;
    rows.push({ heightCm, weightKg, chestCm, waistCm, bmi: weightKg / (heightCm / 100) ** 2 });
  }
  return rows;
}

function solve(A, b) {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let i = 0; i < n; i++) {
    let p = i;
    for (let r = i + 1; r < n; r++) if (Math.abs(M[r][i]) > Math.abs(M[p][i])) p = r;
    [M[i], M[p]] = [M[p], M[i]];
    for (let r = i + 1; r < n; r++) {
      const k = M[r][i] / M[i][i];
      for (let c = i; c <= n; c++) M[r][c] -= k * M[i][c];
    }
  }
  const x = Array(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    let s = M[i][n];
    for (let c = i + 1; c < n; c++) s -= M[i][c] * x[c];
    x[i] = s / M[i][i];
  }
  return x;
}

const FEATURES = [(r) => r.bmi, (r) => r.heightCm];
function fit(rows, target) {
  const k = FEATURES.length + 1;
  const A = Array.from({ length: k }, () => Array(k).fill(0));
  const b = Array(k).fill(0);
  for (const r of rows) {
    const x = [1, ...FEATURES.map((f) => f(r))];
    for (let i = 0; i < k; i++) {
      b[i] += x[i] * r[target];
      for (let j = 0; j < k; j++) A[i][j] += x[i] * x[j];
    }
  }
  return solve(A, b);
}
const predict = (c, r) => c[0] + FEATURES.reduce((s, f, i) => s + c[i + 1] * f(r), 0);

function report(rows, c, target) {
  const errs = rows.map((r) => predict(c, r) - r[target]);
  const mae = errs.reduce((s, e) => s + Math.abs(e), 0) / errs.length;
  const rmse = Math.sqrt(errs.reduce((s, e) => s + e * e, 0) / errs.length);
  const within5 = (errs.filter((e) => Math.abs(e) <= 5).length / errs.length) * 100;
  return `n=${rows.length} MAE ${mae.toFixed(2)} cm, RMSE ${rmse.toFixed(2)} cm, within 5 cm ${within5.toFixed(0)}%`;
}

let seed = 12345;
const rand = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);

for (const sex of ["man", "woman"]) {
  const rows = await load(sex);
  const shuffled = [...rows].sort(() => rand() - 0.5);
  const cut = Math.floor(shuffled.length * 0.8);
  const train = shuffled.slice(0, cut);
  const test = shuffled.slice(cut);
  console.log(`\n${sex}: ${rows.length} usable rows`);
  for (const target of ["chestCm", "waistCm"]) {
    console.log(`  ${target.padEnd(8)} hold-out: ${report(test, fit(train, target), target)}`);
  }
  for (const target of ["chestCm", "waistCm"]) {
    const [intercept, bmi, height] = fit(rows, target);
    const key = target === "chestCm" ? "chest" : "waist";
    console.log(`  ${sex.toUpperCase()}.${key}: { intercept: ${intercept.toFixed(4)}, bmi: ${bmi.toFixed(4)}, height: ${height.toFixed(4)} }`);
  }
}
