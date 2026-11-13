# Zyppi Admin — complete management system (new repo `zyppi-delivery-admin`)

## Context
The customer app (`zyppi-APP`, Flutter, Firebase `zippy-app-2024`) is close to launch. We need a complete operations panel. It is a **fresh build, not based on the old `zyppi-admin`**, in `git@github.com:paulatanu1/zyppi-delivery-admin.git` using Angular 22 and PrimeNG. Today the backend supports only a few admin actions: an `admin: true` claim, `adminUpdateOrderStatus`, `adminListUsers`, `adminReplySupport` and `adminCloseSupport`. There are no riders, notifications, banner scheduling, settings or kill switches, and no reports. This plan does three things:
- lists what exists,
- lists what is missing,
- sets out the frontend and backend work in phases.

Decisions already made: riders **sign up themselves and the admin reviews them**; there is **role-based access**; costly services get **on/off switches** (Places, support bot, PayU, phone OTP, plus maintenance mode); hosting is on **Firebase Hosting** (a second site in the same project).

---

## 1. Audit — what exists today (from `zyppi-APP`, branch `feat/home-violet`)

| Area | Today | Problem / gap |
|---|---|---|
| Admin auth | Custom claim `admin: true` (`functions/scripts/set-admin.ts`, `firestore.rules:20`, `functions/src/shared/callable.ts:11`) | No roles, no audit trail |
| Catalog | `categories` (sub-categories = `parentId`), `products` (embedded `variants[]`, `keywords[]`), admin write | Keyword prefixes are generated on the client. If several clients generate them they drift apart. |
| Stock | `inventory/{storeId}_{variantId}` admin read/write | No low-stock alerts, no stock history |
| Orders | Written only by Functions; statuses `placed\|packed\|out_for_delivery\|delivered\|cancelled` | **Any status can jump to any other. Cancelling does not restore stock or refund.** The rider is free text (`riderName/riderPhone`). |
| Payments | `paymentIntents` (`created\|completed\|failed\|expired\|needs_review`), PayU callables, webhook, 10-min reconciler | No refund flow, and no admin action to resolve `needs_review`. Admins cannot read `paymentReferences`. |
| Coupons | `coupons/{CODE}` flat `discountPaise`, `minOrderPaise`, `expiresAt` | No % discount, no usage or per-user limits, no first-order-only option |
| Banners | `homeSections` type `banner_carousel`, items `{title, cta_text, link_type, link_target, image_url}` | No schedule (start/end), no area targeting, no click stats |
| Delivery config | `config/delivery` exists only on `feat/ux-polish` (not merged). On this branch the fees are hardcoded (`orders/quote.ts:11`) and the `config/*` rules are missing. | **Merge `feat/ux-polish` into `Development` first.** |
| Users | `adminListUsers` scans **all** Auth users and all profiles on every call | Does not scale. No search, block or segments. |
| Push | `onOrderEventCreated` sends FCM to `users.fcmToken`; there is a `notifyOffers` flag | No campaigns, segments, topics or templates |
| Support | Chats plus a retrieval bot (1 GiB function), admin reply/close callables | No admin inbox UI and no KB editor (KB edits need re-embedding) |
| Riders | None (no role, collection or storage path) | Everything is missing |
| Settings / flags | None (no Remote Config or kill switches) | Everything is missing |
| Reports | None | Everything is missing |
| Storage | `catalog/**` public read, admin write (images ≤5 MB) | Need a private `riders/**` path and `banners/`, `notifications/` paths |
| Indexes | 6 composite indexes | Reports, rider and campaign queries need new ones |

## 2. Missing things you didn't list (recommended additions)
1. **Order lifecycle rules**: allow only valid transitions; on cancel, **restock and refund automatically**; record a cancel reason; generate an invoice PDF per order.
2. **Rider assignment and COD cash reconciliation**: assign an order to a verified rider, track the cash each rider collects, and settle it daily.
3. **Audit log**: record every admin write (who, what, before and after) in `auditLogs`.
4. **Roles via custom claims**: `role: super_admin|ops|catalog|support|finance`, and the menus follow the role.
5. **Inventory**: low-stock thresholds with a dashboard alert, stock adjustments with reasons (damage or restock), and a CSV stock import.
6. **Coupon v2**: % or flat discount, a cap, per-user and total usage limits, first-order only, area targeting.
7. **Customer management**: search, order history, block or unblock, and paginated users (replaces the full scan).
8. **Store ops**: store opening hours, a temporary "store closed" switch per area, editable delivery slots, and a service-area map with radius.
9. **Support inbox and KB editor** (PLAN.md §216 Phase 2).
10. **App control**: a minimum app version (force update), maintenance mode, an announcement strip.
11. **Security**: App Check on callables, rate limits on campaign sends, 2FA (TOTP) for super admins.
12. **Data safety**: a scheduled Firestore export (cheap, to a GCS bucket). Its cost is noted in Settings.

## 3. Kill-switch suggestion (Settings → Services)
One doc, `config/features`. Public read for the flags the app needs, admin write. Cloud Functions read it with a 60 s in-memory cache, so a toggle costs almost nothing.

| Switch | Effect when OFF | Saves |
|---|---|---|
| `placesSearch` | `placesProxy` returns `unavailable`; the app hides search and uses GPS plus the free OS geocoder | Places billing per call |
| `supportBot` | `onSupportMessageCreated` exits early; the chat goes to `waiting_agent` or shows WhatsApp/call | 1 GiB compute and cold-start model download |
| `payments.upi` / `payments.card` | `createPayUOrder` rejects that method; the app hides it (COD only) | PayU fees; the reconciler exits immediately when no intents are pending |
| `phoneOtp` | The app hides phone OTP; Google and guest sign-in stay | SMS cost |
| `maintenance` + `message` | The app shows a maintenance screen; `placeOrder` and `createPayUOrder` reject orders | Protects ops |
| `ordering` per service area | `quoteOrder` rejects orders for that area ("store closed") | Ops control |
| `minAppVersion` | The app shows force update | — |

Every switch shows a "cost note", the last changed by/at, and a confirmation dialog. Changes are written to the audit log.
**App work needed** (in `zyppi-APP`): read `config/features` through a new `FeatureFlagsRepository` and honour each flag.

## 4. Backend changes (in `zyppi-APP/functions`, branch `feat/admin-backend` from `Development`)
Each of these changes the data model or rules, which CLAUDE.md requires you to approve. Approving this plan counts as that approval for the items listed here.

**New collections**
- `riders/{uid}`: `fullName, phone, email?, dob, address, serviceAreaId, vehicleType (bike|cycle|scooter|ev), vehicleNumber, docs{aadhaarFront, aadhaarBack, drivingLicence, rc, pan?, selfie} (storage paths), bank{accountName, ifsc, last4} or upiId, status (draft|submitted|under_review|approved|rejected|suspended), rejectionReason, reviewedBy, reviewedAt, isOnline, activeOrderId, codBalancePaise, createdAt`.
- `riders/{uid}/events`: the KYC review history.
- `campaigns/{id}`: `title, body, imageUrl, deepLink{type: product|category|coupon|url, target}, segment{...}, schedule{sendAt?}, status (draft|scheduled|sending|sent|failed|cancelled), stats{targeted, sent, failed, opened}, createdBy`.
- `notificationTemplates/{id}`: reusable text with `{{name}}` placeholders, in 4 languages (en, bn, hi, pa).
- `config/features` (§3), `config/delivery` (from the `feat/ux-polish` merge), `config/app` (support phone, WhatsApp, announcement).
- `auditLogs/{id}`: `actorUid, role, action, target, before, after, at`.
- `stats/daily/{yyyy-mm-dd}` and `stats/areas/{areaId_yyyy-mm-dd}`: orders, GMV, AOV, cancellations, new users, payment-method split, top products, rider deliveries. **These counters keep reports cheap**, because they are written by triggers and charts never scan the `orders` collection.
- `refunds/{id}`: `orderId, intentId, amountPaise, reason, status, payuRequestId, createdBy`.
- `inventoryMovements/{id}`: `storeId, variantId, delta, reason, actor, at`.

**Field additions**
- Orders: `riderId`, `cancelReason`, `refundStatus`, `invoicePath`.
- Users: `blocked`, `lastOrderAt`, `orderCount`, `totalSpentPaise`, `serviceAreaId`, `lang`. These come from triggers and feed segmentation.
- Banner items: `startAt`, `endAt`, `serviceAreaIds[]`, `clicks`.
- Coupons: `type`, `percent`, `maxDiscountPaise`, `usageLimit`, `perUserLimit`, `usedCount`, `firstOrderOnly`, `serviceAreaIds[]`.

**New / changed functions**
- `adminSetRole` (super_admin only) sets the `role` claim. Existing `admin:true` users become `super_admin`.
- `requireRole(request, roles[])` in `shared/callable.ts`. Rules get `hasRole()`.
- `adminUpdateOrderStatus`: adds a transition map, `riderId` assignment (verified riders only), and restock plus refund on cancel.
- `adminRefundPayment` (PayU refund API, finance role). `adminResolveIntent` (`needs_review` → fulfilled / refunded / dismissed).
- `onOrderWritten` trigger updates `stats/*`, the user aggregates and the rider COD balance.
- `onProductWritten` trigger regenerates `keywords` server-side, so there is a single source of truth.
- `adminBulkImportProducts` (CSV/XLSX rows validated server-side, batched writes, a per-row error report).
- `adminAdjustStock` (writes `inventoryMovements`) and a `lowStockDigest` scheduled function (daily, writes an alert doc).
- Riders: `riderSubmitApplication` (the applicant submits), `adminReviewRider` (approve → `rider: true` claim, or reject or suspend, with a reason and an FCM/SMS-free notification by email or in-app), `adminSettleRiderCash`.
- Campaigns: `adminSendCampaign` / `adminScheduleCampaign`, plus a `dispatchCampaigns` scheduled function (every 5 min). It resolves the segment into token batches of 500 (FCM `sendEachForMulticast`), respects `notifyOffers`, and records stats. It also maintains FCM topics `area_<id>` and `lang_<code>` for cheap broadcasts.
- `adminListUsers` v2: paginated Firestore query with search by phone or name. No full Auth scan.
- `adminUpsertKbEntry`: re-embeds the entry and writes `supportKb`.
- `adminAuditedWrite` pattern: every admin callable writes `auditLogs`. Direct client writes to catalog collections are logged by a trigger.
- Feature-flag guards in `placesProxy`, `onSupportMessageCreated`, `createPayUOrder`, `placeOrder`, `quoteOrder` and `reconcilePayUIntents`.

**Rules** (`firestore.rules`, `storage.rules`)
- Role helpers.
- `riders/{uid}`: the applicant can create and update only while in `draft|submitted`, and only the whitelisted fields. Admin (ops) can read.
- Storage `riders/{uid}/kyc/**`: the owner can write (images or PDF ≤5 MB); admin (ops) can read; **never public**.
- `campaigns`, `notificationTemplates`, `auditLogs` (read only, super_admin), `stats` (admin read), `config/*`.
- Storage paths `banners/**` and `notifications/**` (public read, catalog-role write).
- New composite indexes.
- Emulator tests are added in `functions/test` for every new rule and callable.

## 5. Rider self sign-up (this plan's scope)
There is no rider app, so the admin repo ships a **small public "Become a rider" web flow** at `/rider/apply`:
1. Phone OTP sign-in. This is blocked when the `phoneOtp` switch is off; Google sign-in is the fallback.
2. A multi-step PrimeNG form: personal details → vehicle → documents (camera or file upload) → bank/UPI.
3. Submit, then the applicant can see their status and the rejection reason, and resubmit.

A future rider Flutter app uses the same `riders` data and callables.
The admin side has a **Riders** module:
- an application queue (Submitted / Under review),
- a side-by-side document viewer with zoom and rotate,
- a checklist (name matches the ID, DL valid, RC matches the vehicle, the selfie is clear),
- approve / reject (with a reason) / request re-upload / suspend.

Approved riders become assignable on orders. Each rider has a performance tab (deliveries, on-time %, COD balance).

## 6. Admin frontend (`zyppi-delivery-admin`)

**Setup**
- Clone into `~/Documents/zyppi-delivery-admin`. The remote has only `main` with a LICENSE, so create `development-base` from `main`, push it, and branch features from it.
- Angular 22: standalone components, signals, zoneless change detection, the new control flow, lazy routes per feature.
- PrimeNG 22 with `@primeuix/themes` (Aura base) and a custom **Zyppi preset**: primary `#673AB7`, dark `#5E35B1`, tint `#EDE7F6`, surface `#D1C4E9`, accent `#2443D6`, matching `zyppi-APP/lib/core/theme/app_colors.dart`. Light and dark modes are switched with the PrimeNG `darkModeSelector`.
- PrimeIcons, and the `@angular/fire` (Auth, Firestore, Functions, Storage, Messaging) SDK.
- Charts through PrimeNG `p-chart` (Chart.js). XLSX/CSV import and export with `xlsx` (SheetJS) and `papaparse`. PDF reports and invoices with `pdfmake`.
- Tailwind v4 for layout utilities only, using the `tailwindcss-primeui` plugin.

**Look**
- The brand texture is ported from `lib/core/widgets/z_brand_texture.dart` as an inline SVG/CSS pattern on the sidebar header, the login hero and the KPI cards.
- Glass cards over a soft violet gradient, 12–16 px radii, Inter or Plus Jakarta Sans, skeleton loaders, empty states and error-with-retry on every screen.
- Responsive: the sidebar collapses to a drawer on tablet and phone.
- Command palette (Ctrl+K) to jump to any order, product or user.

**Structure**
`src/app/{core (auth, guards, role directive, firebase providers, api services, theme, audit), shared (ui components, pipes like paise→₹), features/*, layout}`.
- All Firestore and callable access goes through one typed service per feature.
- `rupees` pipe: money stays in int paise and is formatted only in the UI.
- Route guards and the `*zHasRole` directive work from the role claim.

**Modules**
1. **Dashboard**:
   - KPI tiles: today's orders, GMV, AOV, pending, cancellations, new users, riders online, low stock.
   - Charts: orders and GMV over time (line), payment-method split (doughnut), orders by hour (bar), area comparison, top products.
   - Live feed of new orders (Firestore listener) with a sound alert.
2. **Orders**:
   - Filterable table (status, area, date, payment, rider) and a Kanban board by status.
   - Detail view: items, a Navigate link (`google.com/maps/dir/?api=1&destination=lat,lng`), timeline from `events`, assign rider, change status (valid transitions only), cancel with refund, invoice PDF, print packing slip.
3. **Products**:
   - List with search and filters, and a create/edit form: variants editor, image upload with client-side compress and crop, category and sub-category, active toggle.
   - **Bulk upload**: download a template → upload XLSX/CSV plus an images ZIP → preview with per-row validation → import through `adminBulkImportProducts` → result report.
   - Bulk price and stock edit.
4. **Categories**: tree view (parent → sub), drag to reorder, colours and image.
5. **Inventory**: per-store grid, adjust with a reason, movement history, low-stock list, CSV stock import.
6. **Banners & Home**:
   - `homeSections` editor: reorder sections by drag and drop.
   - Banner carousel editor: image upload (recommended size shown), live phone-frame preview, link picker (product, category or coupon), schedule start/end, area targeting, active toggle, click stats.
7. **Coupons / Offers**: v2 fields, usage stats.
8. **Notifications**:
   - Composer: title, body, image, deep link, language variants, emoji, preview on an Android mock.
   - **Segment builder**: all users; by service area; by language; by order behaviour (never ordered, ordered in the last N days, inactive N+ days, orders ≥ N, spent ≥ ₹X); `notifyOffers` opt-in only; test send to my device. Shows the audience count before sending.
   - Send now or schedule; campaign history with stats; templates library.
9. **Payments**:
   - Intents table by status.
   - **Needs review queue** with resolve actions.
   - Refunds (initiate and track).
   - Settlement view (online vs COD), COD cash per rider and settle.
   - PayU mode indicator (TEST/PRODUCTION).
10. **Riders**: §5.
11. **Customers**: paginated search, profile, addresses, orders, lifetime value, block or unblock, and a link to send them a notification.
12. **Support**: inbox (waiting agent first, unread badges), chat view with reply and close, order context panel, KB editor (4 languages).
13. **Reports**:
   - Sales (daily, weekly, monthly, by area), product performance, category sales, coupon usage, payment and refund, rider performance and COD, customer cohorts (new vs repeat), inventory valuation and low stock.
   - Date-range picker, export to XLSX, CSV and PDF.
   - All built from `stats/*` plus bounded queries.
14. **Settings**:
   - Services and kill switches (§3), delivery pricing (`config/delivery`), service areas (map plus radius), stores and hours, delivery slots, app config (support contacts, min version, announcement).
   - **Admin users and roles** (super_admin).
   - Audit log viewer.

## 7. Phases
Each phase is one branch from `development-base` (admin) or `Development` (app/functions). Every step ends with lint, unit tests and a build passing.

| # | Phase | Repos | Done when |
|---|---|---|---|
| A0 | Merge `feat/ux-polish` into `Development` (config/delivery); clone and scaffold the admin (Angular 22, PrimeNG preset, theme and texture, layout, login, role guard); hosting target config | both | Login with an admin account works; light/dark shell renders |
| A1 | Backend foundation: roles claim, `requireRole`, audit log, `config/features` and its guards, rules plus emulator tests | functions | `npm test` green; flags toggle function behaviour in the emulator |
| A2 | Catalog: products (with bulk import), categories, inventory, server-side keywords | both | A product is created, a 50-row XLSX is imported, and search finds it in the app |
| A3 | Orders and payments: transitions, cancel → restock and refund, needs-review queue, invoices | both | A COD order is cancelled and its stock returns; a sandbox PayU refund goes through |
| A4 | Riders: public apply flow, KYC storage, review queue, assignment, COD cash | both | An applicant submits, the admin approves, and the rider gets assigned an order |
| A5 | Banners/home editor with schedule and targeting, coupons v2 | both + app | A scheduled banner appears and expires in the app |
| A6 | Notifications: campaigns, segments, templates, scheduler, topics; app deep-link handling | both + app | A segment push reaches a test phone and opens the product |
| A7 | Stats triggers, dashboard charts, reports and exports | both | The dashboard matches the seeded orders; XLSX export opens |
| A8 | Support inbox and KB editor, customers module, settings remainder, app honours all flags | both + app | All flags verified on a real Android phone |
| A9 | Hardening: App Check, 2FA for super admin, Firestore export schedule, deploy to Firebase Hosting (**with your go-ahead**) | both | The production checklist is signed off |

## 8. Verification
- **Admin**: `ng lint`, `ng test` (Vitest, the Angular 22 default), `ng build`. Run against the emulators (`firebase emulators:start` plus the seed) with `useEmulators: true` in `environment.development.ts`.
- **Functions**: `npm --prefix functions run build && npm --prefix functions test` (emulator rules tests for each role and for rider-owner access).
- **Manual checks** in Chrome against the emulator:
  - each module in light and dark mode at desktop and phone widths;
  - role sign-in shows only the allowed menus.
- **End-to-end on a real Android phone** (`fvm flutter run --flavor dev`): order → appears live in the admin → status, rider, push → tracking updates; toggling each kill switch changes app behaviour.
- No `firebase deploy` and no pushes to `main` without asking.
