import fs from "fs";

function checkSheet(sheetName, path) {
  console.log(`\n=== CHECKING ${sheetName} ===`);
  const xml = fs.readFileSync(path, "utf8");

  const mergeMatch = xml.match(/<mergeCells count="(\d+)">(.*?)<\/mergeCells>/);
  if (!mergeMatch) {
    console.log("No mergeCells found.");
    return;
  }

  console.log("mergeCells count:", mergeMatch[1]);
  const refs = [];
  const re = /ref="([^"]+)"/g;
  let m;
  while ((m = re.exec(mergeMatch[2])) !== null) {
    refs.push(m[1]);
  }
  console.log("Actual refs found:", refs.length);

  function parseRef(ref) {
    const parts = ref.split(":");
    function cellToCoords(cell) {
      const colLet = cell.match(/^[A-Z]+/)[0];
      const row = parseInt(cell.slice(colLet.length), 10);
      let col = 0;
      for (let i = 0; i < colLet.length; i++) {
        col = col * 26 + (colLet.charCodeAt(i) - 64);
      }
      return { row, col };
    }
    const c1 = cellToCoords(parts[0]);
    const c2 = parts[1] ? cellToCoords(parts[1]) : c1;
    return { r1: c1.row, c1: c1.col, r2: c2.row, c2: c2.col, ref };
  }

  const ranges = refs.map(parseRef);
  let overlaps = 0;
  for (let i = 0; i < ranges.length; i++) {
    for (let j = i + 1; j < ranges.length; j++) {
      const a = ranges[i];
      const b = ranges[j];
      if (
        Math.max(a.r1, b.r1) <= Math.min(a.r2, b.r2) &&
        Math.max(a.c1, b.c1) <= Math.min(a.c2, b.c2)
      ) {
        console.error("OVERLAP DETECTED:", a.ref, "AND", b.ref);
        overlaps++;
      }
    }
  }
  if (overlaps === 0) console.log("No overlapping merges found.");

  // Check formulas
  const formulas = [];
  const fRe = /<f>([^<]+)<\/f>/g;
  while ((m = fRe.exec(xml)) !== null) {
    formulas.push(m[1]);
  }
  console.log("Formulas count:", formulas.length);
  if (formulas.length > 0) {
    console.log("Sample formulas:", formulas.slice(0, 5));
  }
}

checkSheet("Sheet 1", "src/scripts/unzipped_excel/xl/worksheets/sheet1.xml");
checkSheet("Sheet 2", "src/scripts/unzipped_excel/xl/worksheets/sheet2.xml");
checkSheet("Sheet 3", "src/scripts/unzipped_excel/xl/worksheets/sheet3.xml");

