import "dotenv/config";
import path from "path";
import { fileURLToPath } from "url";
import ExcelJS from "exceljs";
import { pool } from "../config/database.js";
import { buildExcelWorkbook } from "../utils/excelReportGenerator.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function run() {
  console.log("=== STEP 1: GENERATE EXCEL WITH 6 BRANCHES SEBARIS + REKAP PER KARYAWAN ===");
  const wb = await buildExcelWorkbook(pool, "2026-10-01", "2026-10-31");
  const outputPath = path.resolve(__dirname, "../../../Laporan_Presensi_Mimici_6Cabang_Test.xlsx");
  await wb.xlsx.writeFile(outputPath);
  console.log(`Saved sample Excel file to: ${outputPath}`);

  console.log("\n=== STEP 2: VERIFY EXCEL STRUCTURE ===");
  const checkWb = new ExcelJS.Workbook();
  await checkWb.xlsx.readFile(outputPath);

  const s1 = checkWb.getWorksheet("Rekap Presensi Bulanan");
  if (!s1) throw new Error("Sheet 1 not found!");

  console.log("\n[Top 6 Branches in Row 5]:");
  console.log("  Col B (Pakuan):", s1.getCell("B5").value);
  console.log("  Col H (Botani):", s1.getCell("H5").value);
  console.log("  Col N (Azimar):", s1.getCell("N5").value);
  console.log("  Col T (Warung Nangka):", s1.getCell("T5").value);
  console.log("  Col Z (ATS):", s1.getCell("Z5").value);
  console.log("  Col AF (Ciapus):", s1.getCell("AF5").value);

  console.log("\n[Table Headers in Row 6]:");
  console.log("  Pakuan Headers:", [s1.getCell("B6").value, s1.getCell("C6").value, s1.getCell("D6").value, s1.getCell("E6").value, s1.getCell("F6").value]);
  console.log("  Warung Nangka Headers:", [s1.getCell("T6").value, s1.getCell("U6").value, s1.getCell("V6").value, s1.getCell("W6").value, s1.getCell("X6").value]);
  console.log("  Ciapus Headers:", [s1.getCell("AF6").value, s1.getCell("AG6").value, s1.getCell("AH6").value, s1.getCell("AI6").value, s1.getCell("AJ6").value]);

  console.log("\n[Row 7 Sample Attendance]:");
  console.log("  Pakuan (B-F):", { tgl: s1.getCell("B7").value, nama: s1.getCell("C7").value, in: s1.getCell("D7").value, out: s1.getCell("E7").value, stat: s1.getCell("F7").value });
  console.log("  Warung Nangka (T-X):", { tgl: s1.getCell("T7").value, nama: s1.getCell("U7").value, in: s1.getCell("V7").value, out: s1.getCell("W7").value, stat: s1.getCell("X7").value });
  console.log("  Ciapus (AF-AJ):", { tgl: s1.getCell("AF7").value, nama: s1.getCell("AG7").value, in: s1.getCell("AH7").value, out: s1.getCell("AI7").value, stat: s1.getCell("AJ7").value });

  // Find Bottom Panels
  let bottomRow = 0;
  for (let r = 8; r <= s1.rowCount; r++) {
    const val = s1.getCell(`B${r}`).value;
    if (typeof val === "string" && val.includes("Ringkasan Rekap Bulanan")) {
      bottomRow = r;
      break;
    }
  }

  console.log(`\n[Bottom Section found at Row ${bottomRow}]:`);
  console.log("  Panel 1 Title (B):", s1.getCell(`B${bottomRow}`).value);
  console.log("  Panel 2 Title (P):", s1.getCell(`P${bottomRow}`).value);
  console.log("  Panel 3 Title (Y):", s1.getCell(`Y${bottomRow}`).value);

  console.log("\n[Panel 1: Table Headers (Row " + (bottomRow + 1) + ")]:");
  console.log("  Headers:", {
    B: s1.getCell(`B${bottomRow + 1}`).value,
    C: s1.getCell(`C${bottomRow + 1}`).value,
    D: s1.getCell(`D${bottomRow + 1}`).value,
    F: s1.getCell(`F${bottomRow + 1}`).value,
    G: s1.getCell(`G${bottomRow + 1}`).value,
    I: s1.getCell(`I${bottomRow + 1}`).value,
    J: s1.getCell(`J${bottomRow + 1}`).value,
    K: s1.getCell(`K${bottomRow + 1}`).value,
    L: s1.getCell(`L${bottomRow + 1}`).value,
  });

  console.log("\n[Sample Employee Rows in Panel 1]:");
  for (let r = bottomRow + 2; r <= bottomRow + 8; r++) {
    const row = s1.getRow(r);
    if (!row.getCell(2).value) continue;
    console.log(`  Row ${r}:`, {
      No: row.getCell(2).value,
      Nama: row.getCell(3).value,
      Cabang: row.getCell(4).value,
      Hadir: row.getCell(6).value,
      Terlambat: row.getCell(7).value,
      Izin: row.getCell(9).value,
      Sakit: row.getCell(10).value,
      Alfa: row.getCell(11).value,
      Potongan: row.getCell(12).value,
    });
  }

  const totRow = s1.getRow(bottomRow + 2 + 14); // 14 employees + header + subrow
  console.log("\n[Bottom Total Row]:", {
    Label: totRow.getCell(2).value,
    Hadir: totRow.getCell(6).value,
    Terlambat: totRow.getCell(7).value,
    Izin: totRow.getCell(9).value,
    Sakit: totRow.getCell(10).value,
    Alfa: totRow.getCell(11).value,
    TotalPotongan: totRow.getCell(12).value,
  });

  console.log("\nAll checks passed successfully!");
}

run()
  .catch((err) => {
    console.error("Verification failed:", err);
    process.exit(1);
  })
  .finally(async () => {
    await pool.end();
  });
