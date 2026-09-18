import fs from "node:fs";

const text = fs.readFileSync(new URL("./woocommerce-import.csv", import.meta.url), "utf8");

function parseCsv(s) {
  const rows = [];
  let field = "";
  let row = [];
  let quoted = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (quoted) {
      if (c === '"') {
        if (s[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (c !== "\r") field += c;
  }
  if (field.length || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

const rows = parseCsv(text);
const head = rows[0];
const ci = head.findIndex((h) => /ategor/i.test(h));
const ni = head.findIndex((h) => /^name$/i.test(h));
console.log("category column:", JSON.stringify(head[ci]), "| data rows:", rows.length - 1);

const ti = head.findIndex((h) => /^type$/i.test(h));
const only = rows.slice(1).filter((r) => (r[ti] || """").toLowerCase() !== ""variation"");
console.log(""non-variation rows:"", only.length);
for (const b of [""Women > Clothing"", ""Men > Clothing"", ""Kids > Clothing""]) {
  let d = 0, w = 0;
  for (const r of only) {
    const cats = (r[ci] || """").split("","").map((x) => x.trim());
    const hits = cats.filter((c) => c === b || c.startsWith(b + "" >""));
    if (!hits.length) continue;
    if (hits.some((c) => c.startsWith(b + "" >""))) w++; else d++;
  }
  console.log(b + "": "" + d + "" only here, "" + w + "" under a sub-category"");
}
const branches = ["Women > Clothing", "Men > Clothing", "Kids > Clothing"];
for (const branch of branches) {
  let direct = 0;
  let withSub = 0;
  const examples = [];
  for (let i = 1; i < rows.length; i++) {
    const cats = (rows[i][ci] || "").split(",").map((x) => x.trim());
    const hits = cats.filter((c) => c === branch || c.startsWith(branch + " >"));
    if (hits.length === 0) continue;
    if (hits.some((c) => c.startsWith(branch + " >"))) withSub++;
    else {
      direct++;
      if (examples.length < 5) examples.push(`${(rows[i][ni] || "").slice(0, 46)} || ${(rows[i][ci] || "").slice(0, 100)}`);
    }
  }
  console.log(`\n${branch}: ${direct} filed only here, ${withSub} also under a sub-category`);
  for (const e of examples) console.log("   -", e);
}

