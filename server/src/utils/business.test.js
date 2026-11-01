import test from "node:test";
import assert from "node:assert/strict";
import { calculateLateDeduction, calculateLateMinutes, haversineDistance } from "./business.js";

test("menghitung jarak GPS dengan haversine", () => {
  const distance = haversineDistance(-6.595, 106.8, -6.595, 106.801);
  assert.ok(distance > 100 && distance < 120);
});

test("keterlambatan menghormati toleransi sepuluh menit", () => {
  assert.equal(calculateLateMinutes(new Date("2026-10-18T03:10:00Z"), "10:00", 10), 0);
  assert.equal(calculateLateMinutes(new Date("2026-10-18T03:15:00Z"), "10:00", 10), 5);
  assert.equal(calculateLateDeduction(5), 5000);
});

test("keterlambatan dihitung menurut waktu kerja Jakarta", () => {
  assert.equal(calculateLateMinutes(new Date("2026-10-18T03:15:00Z"), "09:00", 10), 65);
});
