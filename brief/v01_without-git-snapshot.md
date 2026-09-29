# Brief v01: Local Development Tanpa Git Snapshot

> **Status:** Current Architecture / Baseline  
> **Scope:** `pakcli-plugin/local` & Workspace Projects  
> **Context:** Single-branch linear commit flow tanpa mekanisme snapshot lokal mandiri.

---

## 1. Executive Summary & Current State

Saat ini alur kerja lokal mengandalkan Git tradisional standar dengan bekerja langsung pada branch fitur aktif (misal: `feat/stable-features-step-by-step`).

Setiap checkpoint pekerjaan dilakukan melalui:
1. **Direct Commit:** `git commit -m "..."` langsung di branch kerja.
2. **Git Stash:** `git stash` sementara jika ingin membersihkan workspace.
3. **Manual Backup Folder:** Menyalin file atau folder ke tempat lain jika ingin bereksperimen berbahaya.

---

## 2. Mengapa Git Tree Terlihat "Tersembunyi" & Hanya 1 Mode/Branch?

Banyak developer mengira Git tree mereka hilang atau hanya ada 1 commit/branch. Penyebab teknisnya:

```
[HEAD -> feat/stable-features-step-by-step] ── dac732c ── 71430f2 ── b24864f ── ...
```

1. **`git log` Default Hanya Menelusuri Jalur `HEAD`**:
   - Jika Anda menjalankan `git log`, Git hanya menelusuri commit dari posisi Anda saat ini (`HEAD`) mundur ke parent pertamanya.
   - Branch lain (seperti `master`, `feat-get-copy`, `remotes/origin/*`) **disembunyikan** oleh default `git log`.
2. **Tidak Menampilkan Diagram Visual / Graph**:
   - Tanpa flag `--graph` dan `--all`, Git tidak menggambar cabang percabangan (*branches*) dan penggabungan (*merges*).
   - **Perintah untuk melihat tree lengkap**:
     ```bash
     git log --graph --oneline --all --decorate
     ```
3. **Penyimpanan Nyata Pointer di `.git`**:
   - Branch lokal disimpan sebagai file teks 41-byte di: `.git/refs/heads/<nama-branch>`.
   - Branch remote disimpan di: `.git/refs/remotes/origin/<nama-branch>`.
   - Isi file tersebut hanyalah 1 buah Hash Commit (misal: `dac732c...`).

---

## 3. Pain Points & Masalah Tanpa Git Snapshot

```
                  ┌─────────────────────────────────────────────────────────┐
                  │                 CURRENT LINEAR WORKFLOW                 │
                  └─────────────────────────────────────────────────────────┘
                                               │
                                       Testing Ekstrem?
                                      /                \
                       [Commit Langsung]             [Gunakan git stash]
                              │                               │
                      Commit Log Kotor              Tertimpa / Lupa Pop
                    (Penuh "wip", "fix")            Conflict saat Apply
                              │                               │
                       Harus Rebase/Squash            Tak Ada Riwayat Jelas
```

| Kategori | Pain Point | Dampak Nyata |
| :--- | :--- | :--- |
| **Commit Clutter** | Terpaksa commit dengan pesan `"wip"`, `"test"`, `"error lagi"` ke branch fitur. | Riwayat commit jadi kotor. Saat hendak pull request/merge, harus repot melakukan interactive rebase (`git rebase -i`). |
| **Risk of Experiment** | Ragu-ragu merombak script / komponen besar karena belum ada checkpoint aman. | Refactoring jadi lambat dan hati-hati berlebihan. |
| **Stash Pitfall** | `git stash` bersifat tumpukan (*stack*), tidak memiliki label deskriptif yang rapi. | Sering lupa isi stash, dan saat `git stash pop` berisiko conflict tanpa visualisasi tree yang jelas. |
| **File Restoration** | Sulit mengambil kembali 1 file versi 20 menit lalu jika belum di-commit. | Kode yang sempat jalan hilang tertimpa editan baru. |

---

## 4. Kesimpulan Baseline (v01)

Sistem tanpa snapshot lokal memaksa developer memperlakukan Git sebagai **riwayat publik** sekaligus **tempat sampah draft kerja**. Ini menyebabkan dilema: *apakah harus commit sekarang padahal kode masih rusak, atau dibiarkan uncommitted dengan risiko kehilangan data?*

Solusi untuk mengatasi dilema ini dibahas pada [v02_with-git-snapshot.md](file:///d:/0pro/pakcli-plugin/local/brief/v02_with-git-snapshot.md).
