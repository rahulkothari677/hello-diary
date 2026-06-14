# 🌙 Hello Diary — Master Roadmap & Task List

This document is the single source of truth for the step-by-step progress of **Hello Diary**. It tracks our position in the 8-step blueprint roadmap and details the checklist for the current phase.

---

## 🗺️ Project Roadmap

- [x] **Step 1: Core Design System & Skeleton Layout** — *Completed & Self-Verified*
  - Directory structure, typography, responsive styling, 24 theme presets, skeleton UI, and developer switcher.
- [ ] **Step 2: Cryptographic Engine & IndexedDB Storage**
  - AES-256-GCM encryption, PBKDF2 key derivation (600k iterations), IndexedDB schemas for entries, tags, credentials, settings.
- [ ] **Step 3: Security Portal (Auth & First-Time Setup)**
  - Setup screen flow (PIN/Pattern setup, default theme selection), Lock screen interface (PIN inputs, pattern drawing, biometric mock).
- [ ] **Step 4: Dashboard Timeline, Calendar, & Search**
  - Dynamic loading/decryption of entries, timeline view, calendar month view with mood indicators, search overlay with tag/mood filters.
- [ ] **Step 5: Premium Editor, Auto-save & Custom Fonts**
  - Rich text formatting toolbar, 12+ selectable fonts, font size adjust, auto-save (30s interval), word count & read-time calculations.
- [ ] **Step 6: Interactive SVG Analytics & Wellness Insights**
  - SVG mood trend line, distribution donut, Year in Pixels, contribution heatmap, wellness statistics (total entries, words, streaks).
- [ ] **Step 7: Ambient Sound Engine, Stickers, & Custom Themes**
  - Ambient audio mixer, sticker/emoji panel, custom theme builder (accent picker + custom wallpaper upload).
- [ ] **Step 8: Data Import/Export, PWAs & Mobile Gestures**
  - JSON/Markdown/CSV backups, import from Day One/Journey, PWA service workers (offline support), mobile swipe gestures.

---

## 🛠️ Step 1: Checklist & Verification Status

- [x] Initialize project directories and structure (`css/`, `js/`, `images/themes/`)
- [x] Create base HTML (`index.html`) with all skeleton screens:
  - [x] Lock Screen structure
  - [x] Setup Screen structure
  - [x] Dashboard Screen (Sidebar/Bottom nav + content area wrappers)
  - [x] Editor Screen (Formatting bar, mood, tags, input)
  - [x] Modals (View entry, Tag prompt, Confirmation)
- [x] Create stylesheets:
  - [x] `css/base.css` (Google Fonts, root variables, layouts)
  - [x] `css/themes.css` (24 curated theme presets as CSS variable overrides)
  - [x] `css/components.css` (Glass cards, button classes, forms, headers)
  - [x] `css/editor.css` (Editor toolbar, custom writing font classes)
  - [x] `css/animations.css` (Aurora floating animation, film grain, fades)
  - [x] `css/responsive.css` (Mobile/tablet/desktop adaptive rules)
- [x] Create `js/dev-toggle.js` (Developer switcher panel for preview)
- [x] Migrate and generate all 24 high-resolution 4K theme wallpaper assets
- [x] Self-verify rendering, theme switching, background wallpapers, and typography in headless Chrome
