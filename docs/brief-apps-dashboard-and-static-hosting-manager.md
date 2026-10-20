# 📌 Master Brief: Apps Dashboard & Static Hosting Manager (pakcli-local)

> **Feature Status**: `0` (Draft / Specification & Architecture)  
> **Target Module**: `local` (`pakcli-local`) & UI Panel (`pakcli-panel`)  
> **Platform**: Desktop (Windows/macOS/Linux via Electron) & Mobile (Obsidian Mobile)  
> **Date**: 2026-10-20  

---

## 1. Executive Summary & Idea Evaluation ("Apakah Ide Ini Bagus?")

### Jawaban Singkat: **Sangat Bagus (9.5/10), Solutif, dan Bernilai Tinggi!** 🚀

### Mengapa Ide Ini Sangat Kuat?
1. **Memecahkan Masalah Nyata Web/Indie Developers (*Fragmented Tooling*):**
   * Developer biasanya memiliki belasan hingga puluhan project di folder lokal (`~/apps`, `D:/0pro/`, dll).
   * Saat ini, untuk mengetahui:
     - Folder mana yang terhubung ke repo GitHub mana,
     - Domain hosting apa yang aktif (`portfolio-x.web.app`, `me.github.io/portfolio`),
     - Apakah ada file uncommitted,
     - Kapan terakhir dideploy,
     Developer harus manual membuka terminal, `cd` satu per satu, menjalankan `git remote -v`, membaca `.firebaserc`, atau login ke web dashboard Firebase/GitHub.
   * **Dashboard ini menyatukan seluruh portofolio lokal dalam satu tabel yang komprehensif, cepat, dan offline-first.**

2. **Detail UI/UX Berkelas Dunia (*Developer-Centric Polish*):**
   * **Zero Selection Hijack:** Teks URL bukan tag `<a>` yang sering terklik tak sengaja saat ingin seleksi teks; link dibuka lewat tombol `↗` terpisah.
   * **Spreadsheet-Ready (1-Click TSV):** Tombol `⧉ Row` menyalin format TSV yang langsung siap di-paste ke Google Sheets / Excel untuk audit portofolio klien.
   * **Non-Blocking Right Drawer:** Panel deploy muncul di drawer kanan melayang, sehingga tabel dashboard di belakang tetap terlihat utuh.
   * **Destructive Guard:** Tindakan berbahaya (`Stop hosting`) mewajibkan mengetik nama situs secara presisi untuk mencegah salah klik.
   * **Mobile-Adaptive:** Otomatis beralih ke kartu individual dengan bottom-sheet di layar sentuh.

3. **Loopback Server yang Aman & Terkendali:**
   * Backend lokal ringan (`127.0.0.1:4747`) dengan session token acak dan **strictly allowlisted CLI commands**. Tidak ada eksekusi string bebas, zero attack vector.

---

## 2. Arsitektur Layar & Spesifikasi Komponen

### Layar 1: Dashboard Utama (Desktop Table View)

```text
┌──────────────────────────── APPS DASHBOARD ────────────────────────────┐
│ Folder: ~/apps   14 apps   [ ⟳ Rescan ]   [ ⚙ Settings ]               │
│ [ Search _______________ ]   [ ▼ Sort: Name ]   [ ▼ Filter: All ]      │
│ Server: 127.0.0.1:4747 (connected)   firebase-cli (ok)   git (ok)     │
└────────────────────────────────────────────────────────────────────────┘
Folder         Path                 GitHub Repo              Static Host                     Actions
portfolio      ~/apps/portfolio     github.com/me/portfolio  fb  portfolio-x.web.app  [⧉][↗] [ Open folder → ] [ ⧉ Row ]
                                                             gh  me.github.io/portfolio   [⧉][↗]
landing-toko   ~/apps/landing-toko  github.com/me/toko       fb  toko-abc.web.app     [⧉][↗] [ Open folder → ] [ ⧉ Row ]
                                                             gh  ~ not enabled ~
catatan        ~/apps/catatan       ~ no remote ~            ~ no host ~ [ + Host ▾ ]    [ Open folder → ] [ ⧉ Row ]
```

#### Spesifikasi Interaksi Tabel:
1. **Free Text Selection:** Seluruh sel berupa teks native selectable. Tidak ada link inline yang mencuri seleksi mouse.
2. **Hover Copy Button `[⧉]`:** Muncul di tepi kanan sel saat kursor hover. Saat diklik, berganti menjadi `✓` hijau selama 1000ms.
3. **Row Exporter `[⧉ Row]`:** Menyalin 1 baris utuh dalam format TSV:
   ```tsv
   Folder\tPath\tGitHub Repo\tFirebase Host\tPages Host
   portfolio\t~/apps/portfolio\tgithub.com/me/portfolio\tportfolio-x.web.app\tme.github.io/portfolio
   ```
4. **Header Diagnostic Bar:** Real-time indicator untuk:
   - Server Local Bridge (`127.0.0.1:4747`)
   - `firebase-cli` (terdeteksi via `firebase --version`)
   - `git` (terdeteksi via `git --version`)
   - Jika CLI tidak ada, tombol yang membutuhkan CLI tersebut dinonaktifkan (`disabled`) dengan tooltip panduan instalasi.

---

### Layar 2: Static Host Cell & Provider Menu

```text
┌──────────  static host (hover)  ───────┐
│ fb  portfolio-x.web.app   [⧉] [↗] [⚙]  │
│ gh  me.github.io/portfolio [⧉] [↗] [⚙] │
│ [ + Host ▾ ]                           │
└────────────────────────────────────────┘
        │ klik [ + Host ▾ ]
        ▼
┌──────────────────────────┐
│ Firebase Hosting         │
│ GitHub Pages             │
│ ──────────────────────── │
│ Vercel      (soon)       │
│ Netlify     (soon)       │
│ Render      (soon)       │
└──────────────────────────┘
```

* **Icon Provider:** Badge pill `fb` (kuning/oranye khas Firebase) dan `gh` (hitam/putih khas GitHub).
* **Tombol `[⚙]`:** Membuka Drawer Layar 3.
* **Menu Provider:** Provider yang belum didukung berstatus disabled `(soon)`.
* **Link Dialog:** Menghubungkan folder baru ke Firebase (`.firebaserc`) atau GitHub Pages branch.

---

### Layar 3: Panel Host (Right Overlay Drawer)

Drawer melayang di sebelah kanan dengan lebar `420px - 480px`. Tabel di belakang tetap terlihat tanpa tertutup total.

#### 3a. Tab "Config deployment" (Firebase)
```text
╔═════════════ fb  portfolio-x.web.app ══════════════╗
║ > Config deployment <   Version history            ║
║ ────────────────────────────────────────────────── ║
║ Status    live · last deploy 2d ago                ║
║ Source    ~/apps/portfolio                         ║
║ Target    portfolio-x (hosting site)               ║
║ Changes   3 uncommitted files                      ║
║                                                    ║
║ ℹ Deploys folder contents, not last commit         ║
║                                                    ║
║ [ Deploy now → ]  [ Preview channel ]              ║
║                                                    ║
║ ┌─ Log Output ───────────────────────────────────┐ ║
║ │ === Deploying to 'portfolio-x'...              │ ║
║ │ i  hosting[portfolio-x]: beginning deploy...   │ ║
║ │ ✔  hosting[portfolio-x]: upload complete       │ ║
║ └────────────────────────────────────────────────┘ ║
║ ────────────────────────────────────────────────── ║
║ Danger Zone   [ Stop hosting… ]                    ║
╚════════════════════════════════════════════════════╝
```
* **Streaming Logs:** Log ANSI/text mengalir real-time di kotak terminal mini.
* **Preview Channel:** Menjalankan `firebase hosting:channel:deploy <name>` untuk membuat temporary staging URL.
* **Stop Hosting:** Membuka konfirmasi Layar 4b.

#### 3b. Tab "Config deployment" (GitHub Pages)
* Source menampilkan branch Pages (`gh-pages` atau `main /docs`).
* Tombol utama: `[ Push to Pages ]`.
* Tombol Danger: `[ Unpublish… ]` (hanya aktif jika `gh` CLI terpasang).

#### 3c. Tab "Version history" (Read-Only)
```text
Version   Message              Date      Status          Action
a3f9c21   fix navbar           2d ago    current (live)  ~ is live ~
7be10d4   add contact page     5d ago                    [ Jump here → ]
1c88e02   initial release      3w ago                    [ Jump here → ]
```
* **Aturan Safe History:** Tidak ada tombol edit, rebase, ataupun delete commit.
* **Rollback Cepat:** Tombol `[ Jump here → ]` untuk instant release switch.

---

### Layar 4: Modal & Dialog Konfirmasi

#### 4a. Konfirmasi Jump Version
```text
╔════════════ Jump to 7be10d4? ═════════════╗
║ Live site will switch to this version.    ║
║ Your folder and git history stay as is.   ║
║                                           ║
║ [ Cancel ]        [ Jump to 7be10d4 → ]   ║
╚═══════════════════════════════════════════╝
```

#### 4b. Konfirmasi Stop Hosting (Type-to-Confirm)
```text
╔════════════ Stop hosting? ════════════════╗
║ portfolio-x.web.app will show 404.        ║
║ Redeploy anytime to bring it back.        ║
║                                           ║
║ Type site name to confirm:                ║
║ [ _____________________ ]                 ║
║                                           ║
║ [ Cancel ]              [ Stop hosting ]  ║
╚═══════════════════════════════════════════╝
```
*Tombol `[ Stop hosting ]` disabled secara otomatis sampai user mengetik nama situs secara persis.*

#### 4c. Link Firebase Site
```text
╔══════════ Link Firebase site ═══════════╗
║ Folder   ~/apps/catatan                 ║
║ Project  [ ▼ pick Firebase project ]    ║
║ Site     [ ▼ pick hosting site ]        ║
║                                         ║
║ [ Cancel ]             [ Link site → ]  ║
╚═════════════════════════════════════════╝
```
*Pilihan project dan site ditarik langsung dari output JSON `firebase projects:list` CLI.*

---

### Layar 5: Mobile Responsive Layout (Card View)

```text
┌──────────────────────────────────────┐
│ portfolio   [clean] [live]           │
│ Firebase  portfolio-x.web.app  [⧉]   │
│ Repo      github.com/me/portfolio[⧉] │
│ Pages     me.github.io/portfolio[⧉]  │
│                                      │
│ [ Copy path ]          [ ⋯ More ]    │
└──────────────────────────────────────┘
```
* Di HP, `Open folder` diganti `Copy path` (karena tidak ada OS file explorer).
* Ikon `[⧉]` selalu tampak (redup), karena perangkat mobile tidak memiliki state kursor hover.
* Drawer host muncul sebagai **Bottom Sheet Modal** (naik dari bawah layar).

---

## 3. Error States, Zero-State & Diagnostics

Tidak menggunakan popup alert mengganggu, melainkan typography informatif inline:

1. **Folder Kosong:**
   ```text
   🗂 Folder kosong
   ~ no apps found in ~/apps ~
   [ Change folder ]   [ Rescan ]
   ```
2. **CLI Missing:**
   ```text
   ⚠ firebase-cli tidak ditemukan
   Install dengan: npm install -g firebase-tools
   Tombol Deploy dan Preview dinonaktifkan sementara.
   ```
3. **Server Terputus:**
   ```text
   ⚠ Server 127.0.0.1:4747 terputus
   Dashboard tidak bisa menjalankan perintah CLI.
   [ Reconnect Server ]   [ View Instructions ]
   ```

---

## 4. Keamanan & Protokol Eksekusi (Strict Loopback Protocol)

1. **Loopback Only:** Server bridge lokal hanya me-listen interface `127.0.0.1` (tidak pernah dibuka ke `0.0.0.0` atau LAN).
2. **Session Authentication:** Setiap server startup membuat token acak berumur 1 sesi (`X-Local-Token`).
3. **Command Allowlist (Anti-Shell Injection):**
   * Server **TIDAK PERNAH** menerima string arbitrary bash/cmd dari UI.
   * Hanya ada fixed endpoint yang memanggil binary tertentu:
     - `GET /api/scan?folder=...` (hanya Node `fs.readdir` aman)
     - `POST /api/deploy/firebase` (hanya memanggil argumen tetap `firebase deploy --only hosting`)
     - `POST /api/git/status` (hanya `git status --porcelain`)
     - `POST /api/git/history` (hanya `git log -n 20`)

---

## 5. Rencana Implementasi & Roadmap File

| Tahap | Modul / File | Tanggung Jawab |
| :--- | :--- | :--- |
| **Phase 1** | `local/src/features/appsDashboard/types.ts` | Data models: `AppRecord`, `HostConfig`, `DeployLog` |
| **Phase 1** | `local/src/features/appsDashboard/services/AppScanner.ts` | Scanner direktori `~/apps`, deteksi `.git`, `.firebaserc` |
| **Phase 2** | `local/src/features/appsDashboard/services/CliBridge.ts` | Bridge aman untuk Git & Firebase CLI commands |
| **Phase 2** | `local/src/features/appsDashboard/ui/AppsDashboardView.ts` | Table desktop view, filter, sort, TSV row exporter |
| **Phase 3** | `local/src/features/appsDashboard/ui/components/HostDrawer.ts` | Right-side overlay drawer & live terminal log stream |
| **Phase 3** | `local/src/features/appsDashboard/ui/modals/StopConfirmModal.ts` | Type-to-confirm modal & Jump version dialog |
| **Phase 4** | `local/src/features/appsDashboard/ui/components/MobileCardView.ts` | Mobile responsive cards & bottom sheet |

---

## 6. Checklist Kriteria Penerimaan (Acceptance Criteria)

- [ ] Status 0 brief dibuat dan terdokumentasi lengkap
- [ ] Scan folder `~/apps` membaca nama, path, remote git, dan hosting config
- [ ] Free text selection pada semua sel tabel dengan hover copy icon `[⧉]`
- [ ] Tombol `⧉ Row` menyalin format TSV bersih (siap paste Sheets)
- [ ] Provider dropdown `[+ Host ▾]` mendukung Firebase dan GitHub Pages
- [ ] Overlay drawer kanan menampilkan live streaming log proses deploy
- [ ] Dialog `Stop hosting` mewajibkan ketik nama situs persis
- [ ] Mode mobile responsive beralih ke kartu dengan tombol `Copy path`
- [ ] Status 1 commit setelah implementasi dan build verification tuntas
