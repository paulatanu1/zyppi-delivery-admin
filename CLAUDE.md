# Zyppi Admin — rules for Claude Code

Angular 22 + NG-ZORRO 22 admin for the Zyppi grocery app. Firebase project `zippy-app-2024`, shared with `../../Desktop/zyppi/zyppi-APP` (Flutter app, plus `functions/`, `firestore.rules`, `storage.rules`). This is a fresh build: **do not reuse code from the old `zyppi-admin` repo**. Base branch **`development-base`**; one branch per phase (`docs/PLAN.md` §7).

## Commands
- `nvm use` (Node 24.15+). After every change, `npm run check` must pass: prettier, lint, tests and build.
- Run against the emulators with `npm run start:emulator`. Start them from `zyppi-APP` with `firebase emulators:start`.

## Code rules
- Standalone components, signals, `OnPush`, the new control flow, and lazy routes per feature. Selector prefix `z-`.
- Layout: `core/` (auth, firebase, theme), `shared/` (ui, pipes), `features/<name>/`, `layout/`.
- Components never import `firebase/*`. Each feature has a `<feature>.api.ts` service that uses the DI tokens in `core/firebase/firebase.ts`.
- Orders, payments, stock, products, categories and order status change **only through Cloud Functions callables** (`adminSaveProduct`, `adminImportProducts`, `adminSaveCategory`, `adminAdjustStock`, …). The rules block direct writes. The same goes for anything audited.
- Spreadsheets: `xlsx` (SheetJS, installed from cdn.sheetjs.com because the npm copy is outdated). Always `await import('xlsx')` so it stays out of the initial bundle.
- Money is `int` paise, formatted only with the `rupees` pipe or `formatPaise`.
- UI comes from NG-ZORRO (`ng-zorro-antd/*` standalone modules). Register new icons in `core/theme/icons.ts`. Confirm dialogs go through `shared/ui/confirm.ts` and toasts through `NzMessageService`.
- No literal colours in components. Use the `--z-*` CSS variables (`src/styles.scss`), the Less variables in `src/themes/*.less`, or Tailwind with those variables. Brand surfaces use the `.z-brand` class, which carries the texture.
- Tailwind utilities are unlayered and there's no preflight (see `src/tailwind.css`). Lists need `list-none p-0` when unstyled.
- Every screen must look right in light and dark mode and from phone width up. Every async screen needs four states: loading (`nz-skeleton`), empty, error with retry, and data.
- Gate menus and routes with `roleGuard` plus `data.roles`, and add the item to `layout/nav.ts`.

## Ask before
- Adding packages not named in `docs/PLAN.md`.
- Changing Firestore or Storage rules or the data model (they live in `zyppi-APP`).
- Any `firebase deploy`, any Hosting site creation, or anything that touches production data.
- Pushing, or opening PRs.
