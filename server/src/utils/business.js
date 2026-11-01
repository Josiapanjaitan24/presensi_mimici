export const POTONGAN_DEFAULT = Object.freeze({ izin: 65000, sakit: 0, alfa: 100000, terlambat: 1000 });

export function getJakartaTime(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Jakarta",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const { hour, minute } = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return {
    hour: Number(hour),
    minute: Number(minute),
    totalMinutes: Number(hour) * 60 + Number(minute),
  };
}

export function isAttendanceOpen(date = new Date()) {
  const { totalMinutes } = getJakartaTime(date);
  // Presensi ditolak pada pukul 00:01 s.d. 06:59 WIB (Presensi dibuka mulai pukul 07:00 WIB)
  return totalMinutes >= 7 * 60;
}

export function haversineDistance(lat1, lon1, lat2, lon2) {
  const toRad = (value) => (Number(value) * Math.PI) / 180;
  const earthRadius = 6371000;
  const dLat = toRad(Number(lat2) - Number(lat1));
  const dLon = toRad(Number(lon2) - Number(lon1));
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return earthRadius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function calculateLateMinutes(actualDate, startTime, tolerance = 10) {
  const actual = new Date(actualDate);
  if (Number.isNaN(actual.getTime())) throw new Error("Waktu presensi tidak valid.");
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(actual);
  const local = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  const [hours, minutes] = String(startTime).slice(0, 5).split(":").map(Number);
  if (!Number.isInteger(hours) || !Number.isInteger(minutes)) {
    throw new Error("Jadwal masuk tidak valid.");
  }
  const actualMinutes = Number(local.hour) * 60 + Number(local.minute);
  const scheduledMinutes = hours * 60 + minutes + Number(tolerance);
  const lateMinutes = actualMinutes - scheduledMinutes;
  return Math.max(0, Math.floor(lateMinutes));
}

export function calculateLateDeduction(minutes, rate = POTONGAN_DEFAULT.terlambat) {
  return Math.max(0, Number(minutes)) * Number(rate);
}

export function assertDateRange(start, end) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end) || end < start) {
    throw new Error("Rentang tanggal tidak valid.");
  }
}

export function isValidCoordinate(value, min, max) {
  return Number.isFinite(Number(value)) && Number(value) >= min && Number(value) <= max;
}

export function csvEscape(value) {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}
