import ExcelJS from "exceljs";

/**
 * Builds the comprehensive Excel report for Mimici Coffee & Space.
 * Sheet 1: "Rekap Presensi Bulanan" (Layout eksekutif: 6 Cabang sebaris penuh + Ringkasan Bulanan per Karyawan)
 * Sheet 2: "Rekap Penggajian (Payroll)" (Complete payroll deduction calculation per employee)
 * Sheet 3: "Log Detail Presensi" (Chronological transactional attendance log)
 */
export async function buildExcelWorkbook(pool, dari, sampai) {
  // 1. Fetch Branches in exact user-requested order:
  // Pakuan, Botani, Azimar, Warung Nangka, ATS, Ciapus
  const bRes = await pool.query(
    "SELECT id_cabang, kode_cabang, nama_cabang FROM cabang WHERE status_cabang = 'aktif' ORDER BY id_cabang"
  );

  const preferredBranchOrder = ["pakuan", "botani", "azimar", "warung nangka", "ats", "ciapus"];
  const branches = [...bRes.rows].sort((a, b) => {
    const idxA = preferredBranchOrder.findIndex((p) => a.nama_cabang.toLowerCase().includes(p));
    const idxB = preferredBranchOrder.findIndex((p) => b.nama_cabang.toLowerCase().includes(p));
    if (idxA !== -1 && idxB !== -1) return idxA - idxB;
    if (idxA !== -1) return -1;
    if (idxB !== -1) return 1;
    return a.nama_cabang.localeCompare(b.nama_cabang);
  });

  // 2. Fetch all employees active in range (deduplicated)
  const empRes = await pool.query(
    `SELECT k.id_karyawan, k.nomor_induk AS nip, k.nama_lengkap, k.hari_libur,
            COALESCE(
              (SELECT c.nama_cabang FROM penempatan_karyawan pk JOIN cabang c ON c.id_cabang = pk.id_cabang
               WHERE pk.id_karyawan = k.id_karyawan ORDER BY pk.berlaku_mulai DESC, pk.id_penempatan DESC LIMIT 1),
              'Belum Ditentukan'
            ) AS cabang_utama,
            (SELECT pk.id_cabang FROM penempatan_karyawan pk
             WHERE pk.id_karyawan = k.id_karyawan ORDER BY pk.berlaku_mulai DESC, pk.id_penempatan DESC LIMIT 1) AS id_cabang_utama
     FROM karyawan k
     WHERE k.status_karyawan = 'aktif'
     ORDER BY k.id_karyawan ASC`,
    []
  );

  // 3. Fetch all attendance & schedules in range
  const attRes = await pool.query(
    `SELECT a.id_absensi, j.id_jadwal, j.tanggal_kerja AS tanggal, j.id_cabang, c.nama_cabang,
            j.id_karyawan, k.nomor_induk AS nip, k.nama_lengkap, k.hari_libur,
            j.jam_masuk, j.jam_pulang, j.toleransi_menit, j.status_jadwal,
            a.waktu_masuk, a.waktu_pulang, a.status_absensi,
            COALESCE(a.menit_terlambat, 0) AS menit_terlambat,
            COALESCE(a.catatan, '-') AS catatan
     FROM jadwal_kerja j
     JOIN karyawan k ON k.id_karyawan = j.id_karyawan
     JOIN cabang c ON c.id_cabang = j.id_cabang
     LEFT JOIN absensi a ON a.id_jadwal = j.id_jadwal
     WHERE j.tanggal_kerja BETWEEN $1 AND $2
     ORDER BY j.tanggal_kerja ASC, a.waktu_masuk ASC, k.nama_lengkap ASC`,
    [dari, sampai]
  );

  // Date and Time helpers
  const formatDateOnly = (val) => {
    if (!val) return "-";
    if (typeof val === "string") {
      const match = val.match(/^(\d{4})-(\d{2})-(\d{2})/);
      if (match) return `${match[3]}/${match[2]}/${match[1]}`;
    }
    if (val instanceof Date) {
      const y = val.getFullYear();
      const m = String(val.getMonth() + 1).padStart(2, "0");
      const d = String(val.getDate()).padStart(2, "0");
      return `${d}/${m}/${y}`;
    }
    return String(val);
  };

  const formatTimeWIB = (val) => {
    if (!val) return "-";
    try {
      const d = new Date(val);
      if (isNaN(d.getTime())) {
        const s = String(val).trim();
        return s.length >= 5 ? s.slice(0, 5) : s;
      }
      return new Intl.DateTimeFormat("id-ID", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
        timeZone: "Asia/Jakarta",
      })
        .format(d)
        .replace(".", ":");
    } catch {
      return "-";
    }
  };

  const cleanCatatan = (val) => {
    if (!val) return "-";
    const s = String(val).trim();
    if (!s || s === "-") return "-";
    if (s.startsWith("{") && (s.includes("foto_masuk") || s.includes("foto_pulang"))) {
      try {
        const parsed = JSON.parse(s);
        const parts = [];
        if (parsed.foto_masuk) parts.push("Foto Masuk Terverifikasi");
        if (parsed.foto_pulang) parts.push("Foto Pulang Terverifikasi");
        if (parsed.catatan) parts.push(parsed.catatan);
        return parts.join(", ") || "Presensi Mandiri";
      } catch {
        return "Presensi Mandiri (Swafoto)";
      }
    }
    if (s.includes("data:image/") || s.length > 300) {
      return s
        .replace(/\{"foto_masuk":"data:image\/[^"]+"\}/g, "[Foto Masuk]")
        .replace(/\{"foto_pulang":"data:image\/[^"]+"\}/g, "[Foto Pulang]")
        .slice(0, 250);
    }
    return s.slice(0, 250);
  };

  const attRows = attRes.rows.map((r) => {
    let tglStr = "";
    if (r.tanggal instanceof Date) {
      const y = r.tanggal.getFullYear();
      const m = String(r.tanggal.getMonth() + 1).padStart(2, "0");
      const d = String(r.tanggal.getDate()).padStart(2, "0");
      tglStr = `${y}-${m}-${d}`;
    } else {
      tglStr = String(r.tanggal).slice(0, 10);
    }
    return {
      ...r,
      tanggalStr: tglStr,
      menit_terlambat: Number(r.menit_terlambat) || 0,
      catatan: cleanCatatan(r.catatan),
    };
  });

  // Calculate Employee Summary for Bottom Recap Table (per Karyawan) & Payroll
  const employeeSummaryMap = {};
  for (const emp of empRes.rows) {
    const hLibur = Array.isArray(emp.hari_libur) ? emp.hari_libur : [];
    employeeSummaryMap[emp.id_karyawan] = {
      id_karyawan: emp.id_karyawan,
      nip: emp.nip,
      nama_lengkap: emp.nama_lengkap,
      cabang_utama: emp.cabang_utama,
      id_cabang_utama: emp.id_cabang_utama,
      hari_libur: hLibur.length > 0 ? hLibur.join(", ") : "-",
      targetHariKerja: 0,
      totalHadir: 0,
      hadirTepatWaktu: 0,
      hariTerlambat: 0,
      hariIzin: 0,
      hariSakit: 0,
      hariAlfa: 0,
      totalMenitTerlambat: 0,
      totalPotongan: 0,
    };
  }

  // Generate Date List
  const daysID = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
  const startD = new Date(dari + "T00:00:00");
  const endD = new Date(sampai + "T00:00:00");
  const dateList = [];
  const curD = new Date(startD);
  while (curD <= endD) {
    const y = curD.getFullYear();
    const m = String(curD.getMonth() + 1).padStart(2, "0");
    const d = String(curD.getDate()).padStart(2, "0");
    const tglStr = `${y}-${m}-${d}`;
    const dayName = daysID[curD.getDay()];
    dateList.push({
      dateStr: tglStr,
      dayName,
      dayNum: curD.getDate(),
      monthNum: curD.getMonth() + 1,
      yearNum: curD.getFullYear(),
      isWeekend: curD.getDay() === 0 || curD.getDay() === 6,
      dateFormatted: `${d}/${m}/${y}`,
    });
    curD.setDate(curD.getDate() + 1);
  }

  for (const d of dateList) {
    for (const emp of empRes.rows) {
      const eSum = employeeSummaryMap[emp.id_karyawan];
      const hLibur = Array.isArray(emp.hari_libur) ? emp.hari_libur : [];
      if (!hLibur.includes(d.dayName)) {
        eSum.targetHariKerja++;
      }
    }
  }

  for (const r of attRows) {
    const eSum = employeeSummaryMap[r.id_karyawan];
    if (eSum) {
      const s = (r.status_absensi || "").toLowerCase();
      if (s === "hadir") {
        eSum.hadirTepatWaktu++;
        eSum.totalHadir++;
      } else if (s === "terlambat") {
        eSum.totalHadir++; // Terlambat juga terhitung sebagai hadir
        eSum.hariTerlambat++;
        eSum.totalMenitTerlambat += r.menit_terlambat;
      } else if (s === "sakit") {
        eSum.hariSakit++;
      } else if (s === "izin") {
        eSum.hariIzin++;
      } else if (s === "alfa") {
        eSum.hariAlfa++;
      }
    }
  }

  // Calculate total potongan per employee
  for (const empId in employeeSummaryMap) {
    const e = employeeSummaryMap[empId];
    e.totalPotongan = e.totalMenitTerlambat * 1000 + e.hariIzin * 65000 + e.hariAlfa * 100000;
  }

  const employeeSummaryList = Object.values(employeeSummaryMap);

  // Group Attendance by Branch
  const branchAttendanceMap = {};
  branches.forEach((br) => {
    branchAttendanceMap[br.id_cabang] = [];
  });

  attRows.forEach((r) => {
    if (r.id_cabang && branchAttendanceMap[r.id_cabang] && r.status_absensi) {
      branchAttendanceMap[r.id_cabang].push(r);
    }
  });

  // Calculate Branch Stats
  const branchStats = branches.map((br) => {
    const branchEmps = new Set();
    empRes.rows.forEach((e) => {
      if (String(e.id_cabang_utama) === String(br.id_cabang)) branchEmps.add(e.id_karyawan);
    });
    attRows.forEach((a) => {
      if (String(a.id_cabang) === String(br.id_cabang)) branchEmps.add(a.id_karyawan);
    });

    const bAtts = branchAttendanceMap[br.id_cabang] || [];
    let hadir = 0;
    let terlambat = 0;
    let izin = 0;
    let sakit = 0;
    let alfa = 0;
    let totalDendaTelat = 0;

    bAtts.forEach((a) => {
      const s = (a.status_absensi || "").toLowerCase();
      if (s === "hadir") hadir++;
      else if (s === "terlambat") {
        hadir++; // Terlambat juga terhitung sebagai hadir
        terlambat++;
        totalDendaTelat += (a.menit_terlambat || 0) * 1000;
      } else if (s === "izin") izin++;
      else if (s === "sakit") sakit++;
      else if (s === "alfa") alfa++;
    });

    const totalPotongan = totalDendaTelat + izin * 65000 + alfa * 100000;

    return {
      branch: br,
      totalKaryawan: branchEmps.size || 0,
      hadir,
      terlambat,
      izin,
      sakit,
      alfa,
      totalPotongan,
      records: bAtts,
    };
  });

  // Overall Totals
  const totalEmployeesCount = empRes.rows.length;
  let overallHadir = 0;
  let overallTerlambat = 0;
  let overallIzin = 0;
  let overallSakit = 0;
  let overallAlfa = 0;
  let overallMenitTerlambat = 0;
  let overallPotongan = 0;

  employeeSummaryList.forEach((e) => {
    overallHadir += e.totalHadir;
    overallTerlambat += e.hariTerlambat;
    overallIzin += e.hariIzin;
    overallSakit += e.hariSakit;
    overallAlfa += e.hariAlfa;
    overallMenitTerlambat += e.totalMenitTerlambat;
    overallPotongan += e.totalPotongan;
  });

  const totalPresensiCount = overallHadir + overallIzin + overallSakit + overallAlfa;
  const attendanceRate = totalPresensiCount > 0
    ? ((overallHadir / totalPresensiCount) * 100).toFixed(1)
    : "100.0";

  // Create Workbook
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Mimici Coffee & Space";
  workbook.lastModifiedBy = "Admin Mimici";
  workbook.created = new Date();
  workbook.modified = new Date();

  const thinBorder = {
    top: { style: "thin", color: { argb: "FFE2E8F0" } },
    left: { style: "thin", color: { argb: "FFE2E8F0" } },
    bottom: { style: "thin", color: { argb: "FFE2E8F0" } },
    right: { style: "thin", color: { argb: "FFE2E8F0" } },
  };

  const cardBorder = {
    top: { style: "thin", color: { argb: "FFCBD5E1" } },
    left: { style: "thin", color: { argb: "FFCBD5E1" } },
    bottom: { style: "thin", color: { argb: "FFCBD5E1" } },
    right: { style: "thin", color: { argb: "FFCBD5E1" } },
  };

  const colLetter = (idx) => {
    let temp = idx;
    let letter = "";
    while (temp > 0) {
      let mod = (temp - 1) % 26;
      letter = String.fromCharCode(65 + mod) + letter;
      temp = Math.floor((temp - mod) / 26);
    }
    return letter;
  };

  const startDay = startD.getDate();
  const endDay = endD.getDate();
  const monthsID = [
    "Januari", "Februari", "Maret", "April", "Mei", "Juni",
    "Juli", "Agustus", "September", "Oktober", "November", "Desember",
  ];
  const startMonthName = monthsID[startD.getMonth()];
  const endMonthName = monthsID[endD.getMonth()];
  const startYear = startD.getFullYear();
  const endYear = endD.getFullYear();

  let periodeLabel = "";
  if (startYear === endYear && startD.getMonth() === endD.getMonth()) {
    periodeLabel = `Periode: ${startDay} – ${endDay} ${endMonthName} ${endYear}`;
  } else if (startYear === endYear) {
    periodeLabel = `Periode: ${startDay} ${startMonthName} – ${endDay} ${endMonthName} ${endYear}`;
  } else {
    periodeLabel = `Periode: ${startDay} ${startMonthName} ${startYear} – ${endDay} ${endMonthName} ${endYear}`;
  }

  // =========================================================================
  // SHEET 1: REKAP PRESENSI BULANAN
  // Layout: 6 Cabang sebaris penuh (Pakuan, Botani, Azimar, Warung Nangka, ATS, Ciapus)
  // Di bawah: Ringkasan Rekap Bulanan PER KARYAWAN + Persentase Kehadiran + Catatan Penting
  // =========================================================================
  const sheet1 = workbook.addWorksheet("Rekap Presensi Bulanan", {
    views: [{ showGridLines: true }],
  });

  // Setup Branch Columns Side-By-Side (B through end of branches):
  const numBranches = Math.max(branches.length, 6);
  const columnsConfig = [{ key: "mar_l", width: 2.5 }];
  for (let i = 0; i < numBranches; i++) {
    columnsConfig.push(
      { key: `tgl_${i}`, width: 11.5 },
      { key: `nama_${i}`, width: 18 },
      { key: `in_${i}`, width: 9.5 },
      { key: `out_${i}`, width: 9.5 },
      { key: `stat_${i}`, width: 11 }
    );
    if (i < numBranches - 1) {
      columnsConfig.push({ key: `sp_${i}`, width: 2.5 });
    }
  }
  columnsConfig.push({ key: "mar_r", width: 2.5 });
  sheet1.columns = columnsConfig;

  // TOP PURPLE BANNER
  const PURPLE_HEADER_COLOR = "FF40236C";
  const lastCol = 2 + (numBranches - 1) * 6 + 4;
  const lastColLet = colLetter(lastCol);

  sheet1.getRow(1).height = 10;

  // Left Brand (B2:H3)
  sheet1.mergeCells("B2:H3");
  const bLeft = sheet1.getCell("B2");
  bLeft.value = "M   MIMICI\nPresensi Karyawan";
  bLeft.font = { name: "Segoe UI", size: 12.5, bold: true, color: { argb: "FFFFFFFF" } };
  bLeft.fill = { type: "pattern", pattern: "solid", fgColor: { argb: PURPLE_HEADER_COLOR } };
  bLeft.alignment = { vertical: "middle", horizontal: "left", wrapText: true, indent: 1 };

  // Center Period (I2:AB3)
  sheet1.mergeCells("I2:AB3");
  const bCenter = sheet1.getCell("I2");
  bCenter.value = `Rekap Presensi Bulanan\n${periodeLabel}`;
  bCenter.font = { name: "Segoe UI", size: 13.5, bold: true, color: { argb: "FFFFFFFF" } };
  bCenter.fill = { type: "pattern", pattern: "solid", fgColor: { argb: PURPLE_HEADER_COLOR } };
  bCenter.alignment = { vertical: "middle", horizontal: "center", wrapText: true };

  // Right Actions (AC2:end)
  sheet1.mergeCells(`AC2:${lastColLet}3`);
  const bRight = sheet1.getCell("AC2");
  bRight.value = "Semua Bulan ▾    Semua Cabang ▾    Export Excel";
  bRight.font = { name: "Segoe UI", size: 10, bold: true, color: { argb: "FFE9D5FF" } };
  bRight.fill = { type: "pattern", pattern: "solid", fgColor: { argb: PURPLE_HEADER_COLOR } };
  bRight.alignment = { vertical: "middle", horizontal: "right", indent: 1 };

  sheet1.getRow(2).height = 22;
  sheet1.getRow(3).height = 22;

  // Apply banner background to all cells B2 through lastCol
  for (let c = 2; c <= lastCol; c++) {
    sheet1.getCell(2, c).fill = { type: "pattern", pattern: "solid", fgColor: { argb: PURPLE_HEADER_COLOR } };
    sheet1.getCell(3, c).fill = { type: "pattern", pattern: "solid", fgColor: { argb: PURPLE_HEADER_COLOR } };
  }

  sheet1.getRow(4).height = 12; // Spacer

  // Status badge style helper
  const applyStatusBadgeStyle = (cell, status) => {
    const s = (status || "").toLowerCase().trim();
    cell.alignment = { vertical: "middle", horizontal: "center" };
    cell.border = thinBorder;

    if (s === "hadir") {
      cell.font = { name: "Segoe UI", size: 9, bold: true, color: { argb: "FF15803D" } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFDCFCE7" } };
    } else if (s === "terlambat") {
      cell.font = { name: "Segoe UI", size: 9, bold: true, color: { argb: "FFB45309" } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFEF3C7" } };
    } else if (s === "izin") {
      cell.font = { name: "Segoe UI", size: 9, bold: true, color: { argb: "FF1D4ED8" } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFDBEAFE" } };
    } else if (s === "sakit") {
      cell.font = { name: "Segoe UI", size: 9, bold: true, color: { argb: "FF047857" } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFD1FAE5" } };
    } else if (s === "alfa") {
      cell.font = { name: "Segoe UI", size: 9, bold: true, color: { argb: "FFB91C1C" } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFEE2E2" } };
    } else if (s === "libur") {
      cell.font = { name: "Segoe UI", size: 8.5, color: { argb: "FF64748B" } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF1F5F9" } };
    } else {
      cell.font = { name: "Segoe UI", size: 9, color: { argb: "FF64748B" } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFFFFF" } };
    }
  };

  // =========================================================================
  // BRANCHES IN ONE FULL ROW (Pakuan, Botani, Azimar, Warung Nangka, ATS, Ciapus, etc.)
  // =========================================================================
  const cardColStarts = branchStats.map((_, idx) => 2 + idx * 6);

  // ROW 5: Branch Card Header Row
  sheet1.getRow(5).height = 25;
  branchStats.forEach((stat, idx) => {
    const sCol = cardColStarts[idx];
    const sLet = colLetter(sCol);
    const mLet = colLetter(sCol + 2);
    const rLet = colLetter(sCol + 3);
    const eLet = colLetter(sCol + 4);

    // Left: Pin + Branch Name
    sheet1.mergeCells(`${sLet}5:${mLet}5`);
    const hLeft = sheet1.getCell(`${sLet}5`);
    hLeft.value = `●  ${stat.branch.nama_cabang}`;
    hLeft.font = { name: "Segoe UI", size: 10.5, bold: true, color: { argb: PURPLE_HEADER_COLOR } };
    hLeft.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF8FAFC" } };
    hLeft.alignment = { vertical: "middle", horizontal: "left", indent: 0.5 };

    // Right: Total Karyawan
    sheet1.mergeCells(`${rLet}5:${eLet}5`);
    const hRight = sheet1.getCell(`${rLet}5`);
    hRight.value = `Total Karyawan: ${stat.totalKaryawan}`;
    hRight.font = { name: "Segoe UI", size: 9, bold: true, color: { argb: "FF475569" } };
    hRight.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF8FAFC" } };
    hRight.alignment = { vertical: "middle", horizontal: "right", indent: 0.5 };

    for (let c = sCol; c <= sCol + 4; c++) {
      sheet1.getCell(5, c).border = cardBorder;
    }
  });

  // ROW 6: Table Headers for all 6 branches
  sheet1.getRow(6).height = 21;
  branchStats.forEach((stat, idx) => {
    const sCol = cardColStarts[idx];
    const headers = ["Tanggal", "Nama Karyawan", "Jam Masuk", "Jam Pulang", "Status"];

    headers.forEach((h, hIdx) => {
      const cell = sheet1.getCell(6, sCol + hIdx);
      cell.value = h;
      cell.font = { name: "Segoe UI", size: 9, bold: true, color: { argb: PURPLE_HEADER_COLOR } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEDE9FE" } };
      cell.alignment = { vertical: "middle", horizontal: hIdx === 1 ? "left" : "center", indent: hIdx === 1 ? 0.5 : 0 };
      cell.border = thinBorder;
    });
  });

  // ROW 7 ONWARDS: Data rows for all 6 branches side-by-side
  const maxRecs = Math.max(...branchStats.map((g) => g.records.length), 0);
  const displayRowsCount = Math.max(maxRecs, 6);

  let curRow = 7;
  for (let rIdx = 0; rIdx < displayRowsCount; rIdx++) {
    sheet1.getRow(curRow).height = 20;

    branchStats.forEach((stat, bIdx) => {
      const sCol = cardColStarts[bIdx];
      const rec = stat.records[rIdx];

      const isEven = rIdx % 2 === 1;
      const rowBg = isEven ? "FFF8FAFC" : "FFFFFFFF";

      if (rec) {
        const cTgl = sheet1.getCell(curRow, sCol);
        cTgl.value = formatDateOnly(rec.tanggal);
        cTgl.font = { name: "Segoe UI", size: 9, color: { argb: "FF334155" } };
        cTgl.alignment = { vertical: "middle", horizontal: "center" };
        cTgl.fill = { type: "pattern", pattern: "solid", fgColor: { argb: rowBg } };
        cTgl.border = thinBorder;

        const cNama = sheet1.getCell(curRow, sCol + 1);
        cNama.value = rec.nama_lengkap;
        cNama.font = { name: "Segoe UI", size: 9, bold: true, color: { argb: "FF0F172A" } };
        cNama.alignment = { vertical: "middle", horizontal: "left", indent: 0.5 };
        cNama.fill = { type: "pattern", pattern: "solid", fgColor: { argb: rowBg } };
        cNama.border = thinBorder;

        const cIn = sheet1.getCell(curRow, sCol + 2);
        cIn.value = formatTimeWIB(rec.waktu_masuk);
        cIn.font = { name: "Segoe UI", size: 9, color: { argb: "FF1E293B" } };
        cIn.alignment = { vertical: "middle", horizontal: "center" };
        cIn.fill = { type: "pattern", pattern: "solid", fgColor: { argb: rowBg } };
        cIn.border = thinBorder;

        const cOut = sheet1.getCell(curRow, sCol + 3);
        cOut.value = formatTimeWIB(rec.waktu_pulang);
        cOut.font = { name: "Segoe UI", size: 9, color: { argb: "FF1E293B" } };
        cOut.alignment = { vertical: "middle", horizontal: "center" };
        cOut.fill = { type: "pattern", pattern: "solid", fgColor: { argb: rowBg } };
        cOut.border = thinBorder;

        const cStat = sheet1.getCell(curRow, sCol + 4);
        cStat.value = rec.status_absensi || "-";
        applyStatusBadgeStyle(cStat, rec.status_absensi);
      } else {
        for (let colOffset = 0; colOffset < 5; colOffset++) {
          const emptyCell = sheet1.getCell(curRow, sCol + colOffset);
          emptyCell.value = rIdx === 0 && stat.records.length === 0 && colOffset === 1 ? "-" : "";
          emptyCell.font = { name: "Segoe UI", size: 9, color: { argb: "FF94A3B8" } };
          emptyCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: rowBg } };
          emptyCell.border = thinBorder;
          emptyCell.alignment = { vertical: "middle", horizontal: "center" };
        }
      }
    });

    curRow++;
  }

  // Spacer before bottom section
  sheet1.getRow(curRow).height = 16;
  curRow++;

  // =========================================================================
  // BOTTOM SECTION:
  // PANEL 1: RINGKASAN REKAP BULANAN (BERDASARKAN NAMA KARYAWAN) - Cols B to N
  // PANEL 2: PERSENTASE KEHADIRAN - Cols P to W
  // PANEL 3: CATATAN PENTING - Cols Y to AJ
  // =========================================================================
  const bottomStartRow = curRow;

  // PANEL 1 HEADER: Ringkasan Rekap Bulanan (Per Karyawan)
  sheet1.mergeCells(`B${bottomStartRow}:N${bottomStartRow}`);
  const p1Header = sheet1.getCell(`B${bottomStartRow}`);
  p1Header.value = "■   Ringkasan Rekap Bulanan (Per Karyawan)";
  p1Header.font = { name: "Segoe UI", size: 10.5, bold: true, color: { argb: "FFFFFFFF" } };
  p1Header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: PURPLE_HEADER_COLOR } };
  p1Header.alignment = { vertical: "middle", horizontal: "left", indent: 1 };

  // PANEL 2 HEADER: Persentase Kehadiran
  sheet1.mergeCells(`P${bottomStartRow}:W${bottomStartRow}`);
  const p2Header = sheet1.getCell(`P${bottomStartRow}`);
  p2Header.value = "●   Persentase Kehadiran";
  p2Header.font = { name: "Segoe UI", size: 10.5, bold: true, color: { argb: "FFFFFFFF" } };
  p2Header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: PURPLE_HEADER_COLOR } };
  p2Header.alignment = { vertical: "middle", horizontal: "left", indent: 1 };

  // PANEL 3 HEADER: Catatan Penting
  sheet1.mergeCells(`Y${bottomStartRow}:AJ${bottomStartRow}`);
  const p3Header = sheet1.getCell(`Y${bottomStartRow}`);
  p3Header.value = "★   Catatan Penting";
  p3Header.font = { name: "Segoe UI", size: 10.5, bold: true, color: { argb: "FFFFFFFF" } };
  p3Header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: PURPLE_HEADER_COLOR } };
  p3Header.alignment = { vertical: "middle", horizontal: "left", indent: 1 };

  sheet1.getRow(bottomStartRow).height = 24;

  // SUB-ROW 1: TABLE HEADERS (PANEL 1) & KPI TOP (PANEL 2 & 3)
  const subRow1 = bottomStartRow + 1;
  sheet1.getRow(subRow1).height = 22;

  // Panel 1 Table Headers (Cols B to N):
  // B: No | C: Nama Karyawan | D-E: Cabang | F: Hadir | G-H: Terlambat | I: Izin | J: Sakit | K: Alfa | L-N: Total Potongan
  sheet1.getCell(`B${subRow1}`).value = "No";
  sheet1.getCell(`C${subRow1}`).value = "Nama Karyawan";
  sheet1.mergeCells(`D${subRow1}:E${subRow1}`);
  sheet1.getCell(`D${subRow1}`).value = "Cabang";
  sheet1.getCell(`F${subRow1}`).value = "Hadir";
  sheet1.mergeCells(`G${subRow1}:H${subRow1}`);
  sheet1.getCell(`G${subRow1}`).value = "Terlambat";
  sheet1.getCell(`I${subRow1}`).value = "Izin";
  sheet1.getCell(`J${subRow1}`).value = "Sakit";
  sheet1.getCell(`K${subRow1}`).value = "Alfa";
  sheet1.mergeCells(`L${subRow1}:N${subRow1}`);
  sheet1.getCell(`L${subRow1}`).value = "Total Potongan";

  ["B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M", "N"].forEach((cLet) => {
    const c = sheet1.getCell(`${cLet}${subRow1}`);
    c.font = { name: "Segoe UI", size: 9, bold: true, color: { argb: PURPLE_HEADER_COLOR } };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEDE9FE" } };
    c.alignment = {
      vertical: "middle",
      horizontal: cLet === "C" ? "left" : cLet === "L" ? "right" : "center",
      indent: cLet === "C" || cLet === "L" ? 0.5 : 0,
    };
    c.border = thinBorder;
  });

  // Panel 2: Big Attendance Rate Badge (Rows subRow1 & subRow2)
  const subRow2 = subRow1 + 1;
  sheet1.mergeCells(`P${subRow1}:R${subRow2}`);
  const rateCell = sheet1.getCell(`P${subRow1}`);
  rateCell.value = `${attendanceRate}%`;
  rateCell.font = { name: "Segoe UI", size: 16, bold: true, color: { argb: "FF4C1D95" } };
  rateCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF3E8FF" } };
  rateCell.alignment = { vertical: "middle", horizontal: "center" };

  sheet1.mergeCells(`S${subRow1}:W${subRow2}`);
  const rateLbl = sheet1.getCell(`S${subRow1}`);
  rateLbl.value = "Tingkat Kehadiran\nSeluruh Karyawan";
  rateLbl.font = { name: "Segoe UI", size: 9.5, bold: true, color: { argb: "FF6B21A8" } };
  rateLbl.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF3E8FF" } };
  rateLbl.alignment = { vertical: "middle", horizontal: "center", wrapText: true };

  // Panel 3: KPI 1 - Total Karyawan (Rows subRow1 & subRow2)
  sheet1.mergeCells(`Y${subRow1}:AB${subRow2}`);
  const kpi1Lbl = sheet1.getCell(`Y${subRow1}`);
  kpi1Lbl.value = "•  Total Karyawan";
  kpi1Lbl.font = { name: "Segoe UI", size: 9.5, bold: true, color: { argb: "FF334155" } };
  kpi1Lbl.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF8FAFC" } };
  kpi1Lbl.alignment = { vertical: "middle", horizontal: "left", indent: 0.5 };

  sheet1.mergeCells(`AC${subRow1}:AJ${subRow2}`);
  const kpi1Val = sheet1.getCell(`AC${subRow1}`);
  kpi1Val.value = `${totalEmployeesCount} Orang`;
  kpi1Val.font = { name: "Segoe UI", size: 11.5, bold: true, color: { argb: "FF0F172A" } };
  kpi1Val.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF8FAFC" } };
  kpi1Val.alignment = { vertical: "middle", horizontal: "right", indent: 0.5 };

  for (let c = 16; c <= 23; c++) {
    sheet1.getCell(subRow1, c).border = thinBorder;
    sheet1.getCell(subRow2, c).border = thinBorder;
  }
  for (let c = 25; c <= 36; c++) {
    sheet1.getCell(subRow1, c).border = thinBorder;
    sheet1.getCell(subRow2, c).border = thinBorder;
  }

  // POPULATE EMPLOYEE ROWS IN PANEL 1
  const p1StartRow = subRow2;
  const empCount = employeeSummaryList.length;

  for (let i = 0; i < empCount; i++) {
    const eRow = p1StartRow + i;
    const emp = employeeSummaryList[i];
    sheet1.getRow(eRow).height = 20;

    const isEven = i % 2 === 1;
    const bg = isEven ? "FFF8FAFC" : "FFFFFFFF";

    // Panel 1: Data per Karyawan
    sheet1.getCell(`B${eRow}`).value = i + 1;
    sheet1.getCell(`B${eRow}`).alignment = { vertical: "middle", horizontal: "center" };

    sheet1.getCell(`C${eRow}`).value = emp.nama_lengkap;
    sheet1.getCell(`C${eRow}`).font = { name: "Segoe UI", size: 9, bold: true, color: { argb: "FF0F172A" } };
    sheet1.getCell(`C${eRow}`).alignment = { vertical: "middle", horizontal: "left", indent: 0.5 };

    sheet1.mergeCells(`D${eRow}:E${eRow}`);
    sheet1.getCell(`D${eRow}`).value = emp.cabang_utama;
    sheet1.getCell(`D${eRow}`).alignment = { vertical: "middle", horizontal: "center" };

    // Hadir (Total Kehadiran, termasuk Terlambat)
    sheet1.getCell(`F${eRow}`).value = emp.totalHadir;
    sheet1.getCell(`F${eRow}`).numFmt = '#,##0';
    sheet1.getCell(`F${eRow}`).alignment = { vertical: "middle", horizontal: "center" };

    // Terlambat
    sheet1.mergeCells(`G${eRow}:H${eRow}`);
    sheet1.getCell(`G${eRow}`).value = emp.hariTerlambat;
    sheet1.getCell(`G${eRow}`).numFmt = '#,##0';
    sheet1.getCell(`G${eRow}`).alignment = { vertical: "middle", horizontal: "center" };
    if (emp.hariTerlambat > 0) {
      sheet1.getCell(`G${eRow}`).font = { name: "Segoe UI", size: 9, bold: true, color: { argb: "FFB45309" } };
    }

    // Izin
    sheet1.getCell(`I${eRow}`).value = emp.hariIzin;
    sheet1.getCell(`I${eRow}`).numFmt = '#,##0';
    sheet1.getCell(`I${eRow}`).alignment = { vertical: "middle", horizontal: "center" };

    // Sakit
    sheet1.getCell(`J${eRow}`).value = emp.hariSakit;
    sheet1.getCell(`J${eRow}`).numFmt = '#,##0';
    sheet1.getCell(`J${eRow}`).alignment = { vertical: "middle", horizontal: "center" };

    // Alfa
    sheet1.getCell(`K${eRow}`).value = emp.hariAlfa;
    sheet1.getCell(`K${eRow}`).numFmt = '#,##0';
    sheet1.getCell(`K${eRow}`).alignment = { vertical: "middle", horizontal: "center" };
    if (emp.hariAlfa > 0) {
      sheet1.getCell(`K${eRow}`).font = { name: "Segoe UI", size: 9, bold: true, color: { argb: "FFDC2626" } };
    }

    // Total Potongan
    sheet1.mergeCells(`L${eRow}:N${eRow}`);
    sheet1.getCell(`L${eRow}`).value = emp.totalPotongan;
    sheet1.getCell(`L${eRow}`).numFmt = '"Rp "#,##0';
    sheet1.getCell(`L${eRow}`).font = { name: "Segoe UI", size: 9, bold: true, color: { argb: "FF0F172A" } };
    sheet1.getCell(`L${eRow}`).alignment = { vertical: "middle", horizontal: "right", indent: 0.5 };

    ["B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M", "N"].forEach((cLet) => {
      const c = sheet1.getCell(`${cLet}${eRow}`);
      c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: bg } };
      c.border = thinBorder;
      if (!c.font) c.font = { name: "Segoe UI", size: 9, color: { argb: "FF334155" } };
    });

    // Panel 2: Breakdown rows (i = 1 to 4)
    if (i === 1) {
      sheet1.mergeCells(`P${eRow}:S${eRow}`);
      sheet1.getCell(`P${eRow}`).value = "●  Hadir";
      sheet1.getCell(`P${eRow}`).font = { name: "Segoe UI", size: 9, bold: true, color: { argb: "FF4C1D95" } };
      sheet1.getCell(`P${eRow}`).alignment = { vertical: "middle", horizontal: "left", indent: 0.5 };

      sheet1.mergeCells(`T${eRow}:W${eRow}`);
      sheet1.getCell(`T${eRow}`).value = overallHadir;
      sheet1.getCell(`T${eRow}`).numFmt = '#,##0';
      sheet1.getCell(`T${eRow}`).font = { name: "Segoe UI", size: 9.5, bold: true, color: { argb: "FF4C1D95" } };
      sheet1.getCell(`T${eRow}`).alignment = { vertical: "middle", horizontal: "right", indent: 0.5 };
    } else if (i === 2) {
      sheet1.mergeCells(`P${eRow}:S${eRow}`);
      sheet1.getCell(`P${eRow}`).value = "●  Izin";
      sheet1.getCell(`P${eRow}`).font = { name: "Segoe UI", size: 9, bold: true, color: { argb: "FF1D4ED8" } };
      sheet1.getCell(`P${eRow}`).alignment = { vertical: "middle", horizontal: "left", indent: 0.5 };

      sheet1.mergeCells(`T${eRow}:W${eRow}`);
      sheet1.getCell(`T${eRow}`).value = overallIzin;
      sheet1.getCell(`T${eRow}`).numFmt = '#,##0';
      sheet1.getCell(`T${eRow}`).font = { name: "Segoe UI", size: 9.5, bold: true, color: { argb: "FF1D4ED8" } };
      sheet1.getCell(`T${eRow}`).alignment = { vertical: "middle", horizontal: "right", indent: 0.5 };
    } else if (i === 3) {
      sheet1.mergeCells(`P${eRow}:S${eRow}`);
      sheet1.getCell(`P${eRow}`).value = "●  Sakit";
      sheet1.getCell(`P${eRow}`).font = { name: "Segoe UI", size: 9, bold: true, color: { argb: "FFD97706" } };
      sheet1.getCell(`P${eRow}`).alignment = { vertical: "middle", horizontal: "left", indent: 0.5 };

      sheet1.mergeCells(`T${eRow}:W${eRow}`);
      sheet1.getCell(`T${eRow}`).value = overallSakit;
      sheet1.getCell(`T${eRow}`).numFmt = '#,##0';
      sheet1.getCell(`T${eRow}`).font = { name: "Segoe UI", size: 9.5, bold: true, color: { argb: "FFD97706" } };
      sheet1.getCell(`T${eRow}`).alignment = { vertical: "middle", horizontal: "right", indent: 0.5 };
    } else if (i === 4) {
      sheet1.mergeCells(`P${eRow}:S${eRow}`);
      sheet1.getCell(`P${eRow}`).value = "●  Alfa";
      sheet1.getCell(`P${eRow}`).font = { name: "Segoe UI", size: 9, bold: true, color: { argb: "FFDC2626" } };
      sheet1.getCell(`P${eRow}`).alignment = { vertical: "middle", horizontal: "left", indent: 0.5 };

      sheet1.mergeCells(`T${eRow}:W${eRow}`);
      sheet1.getCell(`T${eRow}`).value = overallAlfa;
      sheet1.getCell(`T${eRow}`).numFmt = '#,##0';
      sheet1.getCell(`T${eRow}`).font = { name: "Segoe UI", size: 9.5, bold: true, color: { argb: "FFDC2626" } };
      sheet1.getCell(`T${eRow}`).alignment = { vertical: "middle", horizontal: "right", indent: 0.5 };
    } else if (i > 4) {
      sheet1.mergeCells(`P${eRow}:W${eRow}`);
      const c = sheet1.getCell(`P${eRow}`);
      c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFFFFF" } };
    }

    for (let c = 16; c <= 23; c++) {
      sheet1.getCell(eRow, c).border = thinBorder;
    }

    // Panel 3: KPI 2 - Total Keterlambatan (i = 1, 2)
    if (i === 1) {
      sheet1.mergeCells(`Y${eRow}:AB${eRow + 1}`);
      const kpi2Lbl = sheet1.getCell(`Y${eRow}`);
      kpi2Lbl.value = "•  Total Keterlambatan";
      kpi2Lbl.font = { name: "Segoe UI", size: 9.5, bold: true, color: { argb: "FFB45309" } };
      kpi2Lbl.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFEF3C7" } };
      kpi2Lbl.alignment = { vertical: "middle", horizontal: "left", indent: 0.5 };

      sheet1.mergeCells(`AC${eRow}:AJ${eRow + 1}`);
      const kpi2Val = sheet1.getCell(`AC${eRow}`);
      kpi2Val.value = `${overallMenitTerlambat.toLocaleString("id-ID")} Menit`;
      kpi2Val.font = { name: "Segoe UI", size: 11.5, bold: true, color: { argb: "FFB45309" } };
      kpi2Val.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFEF3C7" } };
      kpi2Val.alignment = { vertical: "middle", horizontal: "right", indent: 0.5 };
    }

    // Panel 3: KPI 3 - Total Potongan (i = 3, 4)
    if (i === 3) {
      sheet1.mergeCells(`Y${eRow}:AB${eRow + 1}`);
      const kpi3Lbl = sheet1.getCell(`Y${eRow}`);
      kpi3Lbl.value = "•  Total Potongan";
      kpi3Lbl.font = { name: "Segoe UI", size: 9.5, bold: true, color: { argb: "FFDC2626" } };
      kpi3Lbl.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFEE2E2" } };
      kpi3Lbl.alignment = { vertical: "middle", horizontal: "left", indent: 0.5 };

      sheet1.mergeCells(`AC${eRow}:AJ${eRow + 1}`);
      const kpi3Val = sheet1.getCell(`AC${eRow}`);
      kpi3Val.value = overallPotongan;
      kpi3Val.numFmt = '"Rp "#,##0';
      kpi3Val.font = { name: "Segoe UI", size: 12, bold: true, color: { argb: "FFDC2626" } };
      kpi3Val.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFEE2E2" } };
      kpi3Val.alignment = { vertical: "middle", horizontal: "right", indent: 0.5 };
    }

    if (i > 4) {
      sheet1.mergeCells(`Y${eRow}:AJ${eRow}`);
      const c = sheet1.getCell(`Y${eRow}`);
      c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFFFFF" } };
    }

    for (let c = 25; c <= 36; c++) {
      sheet1.getCell(eRow, c).border = thinBorder;
    }
  }

  // PANEL 1: TOTAL ROW FOR ALL EMPLOYEES
  const p1EndRow = p1StartRow + empCount - 1;
  const totRowIdx = p1EndRow + 1;
  sheet1.getRow(totRowIdx).height = 24;

  sheet1.mergeCells(`B${totRowIdx}:E${totRowIdx}`);
  const totLbl = sheet1.getCell(`B${totRowIdx}`);
  totLbl.value = "TOTAL REKAPITULASI";
  totLbl.font = { name: "Segoe UI", size: 9.5, bold: true, color: { argb: "FF0F172A" } };
  totLbl.alignment = { vertical: "middle", horizontal: "left", indent: 0.5 };

  sheet1.getCell(`F${totRowIdx}`).value = { formula: `SUM(F${p1StartRow}:F${p1EndRow})` };
  sheet1.getCell(`F${totRowIdx}`).numFmt = '#,##0';
  sheet1.getCell(`F${totRowIdx}`).font = { name: "Segoe UI", size: 9.5, bold: true, color: { argb: "FF1E3A8A" } };
  sheet1.getCell(`F${totRowIdx}`).alignment = { vertical: "middle", horizontal: "center" };

  sheet1.mergeCells(`G${totRowIdx}:H${totRowIdx}`);
  sheet1.getCell(`G${totRowIdx}`).value = { formula: `SUM(G${p1StartRow}:G${p1EndRow})` };
  sheet1.getCell(`G${totRowIdx}`).numFmt = '#,##0';
  sheet1.getCell(`G${totRowIdx}`).font = { name: "Segoe UI", size: 9.5, bold: true, color: { argb: "FFB45309" } };
  sheet1.getCell(`G${totRowIdx}`).alignment = { vertical: "middle", horizontal: "center" };

  sheet1.getCell(`I${totRowIdx}`).value = { formula: `SUM(I${p1StartRow}:I${p1EndRow})` };
  sheet1.getCell(`I${totRowIdx}`).numFmt = '#,##0';
  sheet1.getCell(`I${totRowIdx}`).alignment = { vertical: "middle", horizontal: "center" };

  sheet1.getCell(`J${totRowIdx}`).value = { formula: `SUM(J${p1StartRow}:J${p1EndRow})` };
  sheet1.getCell(`J${totRowIdx}`).numFmt = '#,##0';
  sheet1.getCell(`J${totRowIdx}`).alignment = { vertical: "middle", horizontal: "center" };

  sheet1.getCell(`K${totRowIdx}`).value = { formula: `SUM(K${p1StartRow}:K${p1EndRow})` };
  sheet1.getCell(`K${totRowIdx}`).numFmt = '#,##0';
  sheet1.getCell(`K${totRowIdx}`).font = { name: "Segoe UI", size: 9.5, bold: true, color: { argb: "FFDC2626" } };
  sheet1.getCell(`K${totRowIdx}`).alignment = { vertical: "middle", horizontal: "center" };

  sheet1.mergeCells(`L${totRowIdx}:N${totRowIdx}`);
  sheet1.getCell(`L${totRowIdx}`).value = { formula: `SUM(L${p1StartRow}:L${p1EndRow})` };
  sheet1.getCell(`L${totRowIdx}`).numFmt = '"Rp "#,##0';
  sheet1.getCell(`L${totRowIdx}`).font = { name: "Segoe UI", size: 10.5, bold: true, color: { argb: "FFDC2626" } };
  sheet1.getCell(`L${totRowIdx}`).alignment = { vertical: "middle", horizontal: "right", indent: 0.5 };

  ["B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M", "N"].forEach((cLet) => {
    const c = sheet1.getCell(`${cLet}${totRowIdx}`);
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE2E8F0" } };
    c.border = { top: { style: "thin" }, bottom: { style: "double" } };
  });

  // Finish bottom borders for Panel 2 & 3
  sheet1.mergeCells(`P${totRowIdx}:W${totRowIdx}`);
  const p2Tot = sheet1.getCell(`P${totRowIdx}`);
  p2Tot.value = `Total Data Presensi: ${totalPresensiCount} Record`;
  p2Tot.font = { name: "Segoe UI", size: 9, bold: true, color: { argb: "FF4C1D95" } };
  p2Tot.alignment = { vertical: "middle", horizontal: "center" };
  for (let c = 16; c <= 23; c++) {
    sheet1.getCell(totRowIdx, c).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE2E8F0" } };
    sheet1.getCell(totRowIdx, c).border = { top: { style: "thin" }, bottom: { style: "double" } };
  }

  sheet1.mergeCells(`Y${totRowIdx}:AJ${totRowIdx}`);
  const p3Tot = sheet1.getCell(`Y${totRowIdx}`);
  p3Tot.value = `Mimici Coffee & Space  •  ${periodeLabel}`;
  p3Tot.font = { name: "Segoe UI", size: 9, bold: true, color: { argb: "FF334155" } };
  p3Tot.alignment = { vertical: "middle", horizontal: "center" };
  for (let c = 25; c <= 36; c++) {
    sheet1.getCell(totRowIdx, c).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE2E8F0" } };
    sheet1.getCell(totRowIdx, c).border = { top: { style: "thin" }, bottom: { style: "double" } };
  }

  // =========================================================================
  // SHEET 2: REKAP PENGGAJIAN (PAYROLL EXECUTIVE VIEW)
  // =========================================================================
  const sheet2 = workbook.addWorksheet("Rekap Penggajian (Payroll)", {
    views: [{ showGridLines: true }],
  });

  sheet2.columns = [
    { key: "no", width: 6 },
    { key: "nip", width: 15 },
    { key: "nama", width: 22 },
    { key: "cabang", width: 18 },
    { key: "hari_libur", width: 16 },
    { key: "target", width: 13 },
    { key: "hadir", width: 13 },
    { key: "selisih", width: 11 },
    { key: "menit_terlambat", width: 20 },
    { key: "tarif", width: 16 },
    { key: "denda_telat", width: 20 },
    { key: "izin_hari", width: 12 },
    { key: "potongan_izin", width: 18 },
    { key: "alfa_hari", width: 12 },
    { key: "potongan_alfa", width: 18 },
    { key: "total_potongan", width: 24 },
  ];

  sheet2.mergeCells("A1:P1");
  const s2T1 = sheet2.getCell("A1");
  s2T1.value = "MIMICI COFFEE & SPACE  •  REKAPITULASI PENGGAJIAN & POTONGAN DISIPLIN";
  s2T1.font = { name: "Segoe UI", size: 13, bold: true, color: { argb: "FFFFFFFF" } };
  s2T1.fill = { type: "pattern", pattern: "solid", fgColor: { argb: PURPLE_HEADER_COLOR } };
  s2T1.alignment = { vertical: "middle", horizontal: "center" };
  sheet2.getRow(1).height = 28;

  sheet2.mergeCells("A2:P2");
  const s2T2 = sheet2.getCell("A2");
  s2T2.value = `Periode: ${dari} s/d ${sampai}  •  Aturan: Terlambat Rp 1.000/menit  •  Izin Rp 65.000/hari  •  Alfa Rp 100.000/hari  •  Sakit Rp 0`;
  s2T2.font = { name: "Segoe UI", size: 9.5, italic: true, color: { argb: "FFE0E7FF" } };
  s2T2.fill = { type: "pattern", pattern: "solid", fgColor: { argb: PURPLE_HEADER_COLOR } };
  s2T2.alignment = { vertical: "middle", horizontal: "center" };
  sheet2.getRow(2).height = 20;

  sheet2.getRow(3).height = 8;

  const s2Headers = [
    "No", "NIP", "Nama Karyawan", "Cabang Utama", "Hari Libur",
    "Target", "Hadir", "Selisih", "Total Telat (Mnt)", "Tarif (Rp/Mnt)",
    "Denda Telat", "Izin (Hari)", "Potongan Izin", "Alfa (Hari)", "Potongan Alfa", "TOTAL POTONGAN",
  ];

  const s2HRow = sheet2.getRow(4);
  s2HRow.values = s2Headers;
  s2HRow.height = 26;
  s2HRow.eachCell((cell) => {
    cell.font = { name: "Segoe UI", size: 9.5, bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF2563EB" } };
    cell.alignment = { vertical: "middle", horizontal: "center" };
    cell.border = thinBorder;
  });

  let s2DataRow = 5;
  for (let i = 0; i < employeeSummaryList.length; i++) {
    const emp = employeeSummaryList[i];
    const r = sheet2.getRow(s2DataRow);
    r.height = 22;

    const potIzin = emp.hariIzin * 65000;
    const potAlfa = emp.hariAlfa * 100000;
    const totalHadirSemua = emp.totalHadir;
    const selisih = totalHadirSemua - emp.targetHariKerja;

    r.values = [
      i + 1,
      emp.nip,
      emp.nama_lengkap,
      emp.cabang_utama,
      emp.hari_libur,
      emp.targetHariKerja,
      totalHadirSemua,
      selisih,
      emp.totalMenitTerlambat,
      1000,
      { formula: `I${s2DataRow}*J${s2DataRow}` },
      emp.hariIzin,
      potIzin,
      emp.hariAlfa,
      potAlfa,
      { formula: `K${s2DataRow}+M${s2DataRow}+O${s2DataRow}` },
    ];

    const isEven = i % 2 === 1;
    const bg = isEven ? "FFF8FAFC" : "FFFFFFFF";

    r.eachCell((cell, colNum) => {
      cell.border = thinBorder;
      cell.font = { name: "Segoe UI", size: 9.5, color: { argb: "FF1E293B" } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: bg } };
      cell.alignment = { vertical: "middle" };

      if ([1, 2, 5, 6, 7, 8, 12, 14].includes(colNum)) {
        cell.alignment = { vertical: "middle", horizontal: "center" };
      }
      if (colNum === 3) {
        cell.font = { name: "Segoe UI", size: 9.5, bold: true, color: { argb: "FF0F172A" } };
      }
      if (colNum === 9) {
        cell.alignment = { vertical: "middle", horizontal: "center" };
        cell.numFmt = '#,##0';
        if (emp.totalMenitTerlambat > 0) {
          cell.font = { name: "Segoe UI", size: 10, bold: true, color: { argb: "FFDC2626" } };
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFEE2E2" } };
        }
      } else if ([10, 11, 13, 15, 16].includes(colNum)) {
        cell.alignment = { vertical: "middle", horizontal: "right" };
        cell.numFmt = '"Rp "#,##0';
        if (colNum === 16) {
          cell.font = { name: "Segoe UI", size: 10, bold: true, color: { argb: "FFDC2626" } };
        }
      }
    });

    s2DataRow++;
  }

  // Summary Row on Sheet 2
  const s2TotRow = sheet2.getRow(s2DataRow);
  s2TotRow.height = 25;
  sheet2.mergeCells(`A${s2DataRow}:H${s2DataRow}`);
  const s2TotLbl = sheet2.getCell(`A${s2DataRow}`);
  s2TotLbl.value = "TOTAL KESELURUHAN SELURUH KARYAWAN";
  s2TotLbl.font = { name: "Segoe UI", size: 10, bold: true, color: { argb: "FF0F172A" } };
  s2TotLbl.alignment = { vertical: "middle", horizontal: "right" };
  s2TotLbl.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE2E8F0" } };
  s2TotLbl.border = { top: { style: "thin" }, bottom: { style: "double" } };

  const s2TotMnt = sheet2.getCell(`I${s2DataRow}`);
  s2TotMnt.value = { formula: `SUM(I5:I${s2DataRow - 1})` };
  s2TotMnt.numFmt = '#,##0';
  s2TotMnt.font = { name: "Segoe UI", size: 11, bold: true, color: { argb: "FFDC2626" } };
  s2TotMnt.alignment = { vertical: "middle", horizontal: "center" };
  s2TotMnt.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFEE2E2" } };
  s2TotMnt.border = { top: { style: "thin" }, bottom: { style: "double" } };

  sheet2.getCell(`J${s2DataRow}`).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE2E8F0" } };
  sheet2.getCell(`J${s2DataRow}`).border = { top: { style: "thin" }, bottom: { style: "double" } };

  const s2TotDnd = sheet2.getCell(`K${s2DataRow}`);
  s2TotDnd.value = { formula: `SUM(K5:K${s2DataRow - 1})` };
  s2TotDnd.numFmt = '"Rp "#,##0';
  s2TotDnd.font = { name: "Segoe UI", size: 10.5, bold: true, color: { argb: "FFDC2626" } };
  s2TotDnd.alignment = { vertical: "middle", horizontal: "right" };
  s2TotDnd.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE2E8F0" } };
  s2TotDnd.border = { top: { style: "thin" }, bottom: { style: "double" } };

  sheet2.getCell(`L${s2DataRow}`).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE2E8F0" } };
  sheet2.getCell(`L${s2DataRow}`).border = { top: { style: "thin" }, bottom: { style: "double" } };

  const s2TotIz = sheet2.getCell(`M${s2DataRow}`);
  s2TotIz.value = { formula: `SUM(M5:M${s2DataRow - 1})` };
  s2TotIz.numFmt = '"Rp "#,##0';
  s2TotIz.alignment = { vertical: "middle", horizontal: "right" };
  s2TotIz.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE2E8F0" } };
  s2TotIz.border = { top: { style: "thin" }, bottom: { style: "double" } };

  sheet2.getCell(`N${s2DataRow}`).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE2E8F0" } };
  sheet2.getCell(`N${s2DataRow}`).border = { top: { style: "thin" }, bottom: { style: "double" } };

  const s2TotAlf = sheet2.getCell(`O${s2DataRow}`);
  s2TotAlf.value = { formula: `SUM(O5:O${s2DataRow - 1})` };
  s2TotAlf.numFmt = '"Rp "#,##0';
  s2TotAlf.alignment = { vertical: "middle", horizontal: "right" };
  s2TotAlf.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE2E8F0" } };
  s2TotAlf.border = { top: { style: "thin" }, bottom: { style: "double" } };

  const s2TotGrd = sheet2.getCell(`P${s2DataRow}`);
  s2TotGrd.value = { formula: `SUM(P5:P${s2DataRow - 1})` };
  s2TotGrd.numFmt = '"Rp "#,##0';
  s2TotGrd.font = { name: "Segoe UI", size: 11, bold: true, color: { argb: "FFDC2626" } };
  s2TotGrd.alignment = { vertical: "middle", horizontal: "right" };
  s2TotGrd.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE2E8F0" } };
  s2TotGrd.border = { top: { style: "thin" }, bottom: { style: "double" } };

  // =========================================================================
  // SHEET 3: LOG DETAIL TRANSAKSI PRESENSI
  // =========================================================================
  const sheet3 = workbook.addWorksheet("Log Detail Presensi", {
    views: [{ showGridLines: true }],
  });

  sheet3.columns = [
    { key: "no", width: 6 },
    { key: "tanggal", width: 14 },
    { key: "hari", width: 12 },
    { key: "nip", width: 16 },
    { key: "nama", width: 22 },
    { key: "cabang", width: 18 },
    { key: "masuk", width: 13 },
    { key: "pulang", width: 13 },
    { key: "status", width: 16 },
    { key: "terlambat", width: 16 },
    { key: "denda", width: 18 },
    { key: "catatan", width: 40 },
  ];

  sheet3.mergeCells("A1:L1");
  const s3Title = sheet3.getCell("A1");
  s3Title.value = "LOG DETAIL DATA TRANSAKSI PRESENSI & JADWAL KERJA";
  s3Title.font = { name: "Segoe UI", size: 13, bold: true, color: { argb: "FFFFFFFF" } };
  s3Title.fill = { type: "pattern", pattern: "solid", fgColor: { argb: PURPLE_HEADER_COLOR } };
  s3Title.alignment = { vertical: "middle", horizontal: "center" };
  sheet3.getRow(1).height = 26;

  sheet3.mergeCells("A2:L2");
  const s3Sub = sheet3.getCell("A2");
  s3Sub.value = `Periode: ${dari} s/d ${sampai}  •  Total Data: ${attRows.length} Baris`;
  s3Sub.font = { name: "Segoe UI", size: 9.5, italic: true, color: { argb: "FFE0E7FF" } };
  s3Sub.fill = { type: "pattern", pattern: "solid", fgColor: { argb: PURPLE_HEADER_COLOR } };
  s3Sub.alignment = { vertical: "middle", horizontal: "center" };
  sheet3.getRow(2).height = 18;

  sheet3.getRow(3).height = 8;

  const s3Headers = [
    "No", "Tanggal", "Hari", "NIP", "Nama Karyawan", "Cabang",
    "Jam Masuk", "Jam Pulang", "Status", "Terlambat (Menit)", "Denda Keterlambatan", "Keterangan / Catatan",
  ];

  const s3HRow = sheet3.getRow(4);
  s3HRow.values = s3Headers;
  s3HRow.height = 26;
  s3HRow.eachCell((cell) => {
    cell.font = { name: "Segoe UI", size: 9.5, bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF2563EB" } };
    cell.alignment = { vertical: "middle", horizontal: "center" };
    cell.border = thinBorder;
  });

  let s3RowIdx = 5;
  for (let i = 0; i < attRows.length; i++) {
    const row = attRows[i];
    const r = sheet3.getRow(s3RowIdx);
    r.height = 20;

    const d = new Date(row.tanggalStr + "T00:00:00");
    const dName = daysID[d.getDay()] || "Senin";
    const dendaRp = row.menit_terlambat * 1000;

    r.values = [
      i + 1,
      formatDateOnly(row.tanggal),
      dName,
      row.nip,
      row.nama_lengkap,
      row.nama_cabang,
      formatTimeWIB(row.waktu_masuk),
      formatTimeWIB(row.waktu_pulang),
      row.status_absensi || "-",
      row.menit_terlambat,
      dendaRp,
      row.catatan || "-",
    ];

    const isEven = i % 2 === 1;
    const bg = isEven ? "FFF8FAFC" : "FFFFFFFF";

    r.eachCell((cell, colNum) => {
      cell.border = thinBorder;
      cell.font = { name: "Segoe UI", size: 9, color: { argb: "FF1E293B" } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: bg } };
      cell.alignment = { vertical: "middle" };

      if ([1, 2, 3, 4, 7, 8, 9, 10].includes(colNum)) {
        cell.alignment = { vertical: "middle", horizontal: "center" };
      }
      if (colNum === 10) {
        cell.numFmt = '#,##0';
        if (row.menit_terlambat > 0) {
          cell.font = { name: "Segoe UI", size: 9.5, bold: true, color: { argb: "FFDC2626" } };
        }
      } else if (colNum === 11) {
        cell.alignment = { vertical: "middle", horizontal: "right" };
        cell.numFmt = '"Rp "#,##0';
        if (dendaRp > 0) {
          cell.font = { name: "Segoe UI", size: 9.5, bold: true, color: { argb: "FFDC2626" } };
        }
      }
    });

    s3RowIdx++;
  }

  return workbook;
}
