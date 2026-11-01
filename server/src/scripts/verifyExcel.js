import ExcelJS from "exceljs";

async function testExport() {
  const loginRes = await fetch("http://127.0.0.1:5001/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ identitas: "admin", kata_sandi: "admin123" }),
  });
  const { token } = await loginRes.json();

  const res = await fetch("http://127.0.0.1:5001/api/admin/reports/export?dari=2026-10-01&sampai=2026-10-31", {
    headers: { Authorization: "Bearer " + token },
  });
  console.log("Export HTTP status:", res.status, res.headers.get("content-type"));

  const arrayBuffer = await res.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  console.log("Received Excel buffer size:", buffer.length, "bytes");

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  console.log("Worksheets in Excel:", workbook.worksheets.map((w) => w.name));

  const sheet1 = workbook.getWorksheet("Rekap Presensi & Pengajuan");
  console.log("Sheet 1 row count:", sheet1.rowCount);
  console.log("Sheet 1 Title A1:", sheet1.getCell("A1").value);
  console.log("Sheet 1 Headers Row 5:", sheet1.getRow(5).values.filter(Boolean));

  for (let r = 6; r <= sheet1.rowCount; r++) {
    const row = sheet1.getRow(r);
    console.log(`Row ${r}: No=${row.getCell(1).value}, Tgl=${row.getCell(2).value}, Nama=${row.getCell(4).value}, Status=${row.getCell(8).value}, Terlambat=${row.getCell(9).value}, Potongan=${row.getCell(10).value}`);
  }
}

testExport();
