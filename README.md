# Zyppi Admin

Operations panel for the Zyppi quick-commerce app: orders, riders, catalog, inventory, banners, notifications, payments, reports and settings. Built with Angular 22 (standalone, signals, zoneless), NG-ZORRO 22 (Ant Design, MIT) and Tailwind v4, on the Firebase project `zippy-app-2024`, which it shares with the customer app (`zyppi-APP`).

The roadmap is in [`docs/PLAN.md`](docs/PLAN.md). Phase A0 (this scaffold) covers the shell, theme, login and roles.

## Requirements
- Node **24.15+**. Run `nvm use` to pick up `.nvmrc`.
- For local backend work: Java 21+ and the Firebase CLI. The emulators run from the `zyppi-APP` repo.

## Commands
| | |
|---|---|
| `npm start` | Dev server against the real project |
| `npm run start:emulator` | Dev server against the local emulators (Auth 9099, Firestore 8080, Functions 5001, Storage 9199) |
| `npm run check` | Prettier check, then lint, unit tests (Vitest) and production build. Run this before every commit. |
| `npm run format` | Prettier write |

## Access
- Staff sign in with email and password.
- Access comes from the Firebase Auth custom claim `role`: `super_admin | ops | catalog | support | finance`. The legacy `admin: true` claim counts as `super_admin`.
- Accounts with no role are signed out with an explanation.

## UI library
NG-ZORRO (MIT, free). Its Less themes are in `src/themes/`: `light.less` and `dark.less` use the Zyppi purple, radii and fonts. They're built as the `theme-light.css` and `theme-dark.css` bundles, and `ThemeService` swaps the `<link id="z-theme">` between them. Charts (A7) will use ngx-echarts (MIT).

## Hosting
Firebase Hosting, target `admin` (`firebase.json`). Setting it up is a one-time step that changes the Firebase project:
```
firebase hosting:sites:create <site-id> --project zippy-app-2024
firebase target:apply hosting admin <site-id>
```
Deploy with `npm run build && firebase deploy --only hosting:admin`, only with the owner's go-ahead.
