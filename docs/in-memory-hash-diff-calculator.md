---
id: in-memory-hash-diff-calculator
title: In-Memory Hash & Diff Calculator
plugin: local
status: 0
tags:
  - pakcli
  - local
  - hash
  - diff
  - feature
created: 2026-10-09
---

# In-Memory Hash & Diff Calculator

## 1. Overview
Kalkulator hash cepat (MD5 / SHA-256) dan pembanding perbedaan biner file berbasis memori untuk mendeteksi file duplikat, gambar identik dengan nama berbeda, dan riwayat mutasi file di seluruh vault.

## 2. Key Capabilities (Planned)
- **High-Throughput Hashing**: Menghitung hash aset besar secara streaming tanpa menyebabkan konsumsi RAM melonjak.
- **Duplicate Asset Finder**: Mengidentifikasi gambar atau PDF yang tersimpan dobel di beberapa folder vault berbeda.
- **Fast Content Comparison**: Membandingkan konten 2 file secara instan untuk menentukan kesamaan data.

## 3. Integration Points
- Digunakan oleh `ImageTriageModal` dan alat sinkronisasi aset `pakcli-panel`.

## 4. Status: 0 (Planned / In Progress)
Modul utilitas hash telah tersedia; tampilan antarmuka pelaporan aset duplikat sedang dirancang.
