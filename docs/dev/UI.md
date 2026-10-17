# Menus and HUD (src/ui)

All UI text is Turkish. Screens are DOM panels above the 3D canvas; the studio behind them is `render/showroom.ts`.

## Modules

| File | Role |
| --- | --- |
| `screens.ts` | Panel framework: one visible panel at a time, dialogs, toasts, showroom staging, input intents. |
| `ctx.ts` | `UiActions` (what screens ask the game to do), `UiCtx`, `header()`, `btn()`. |
| `menuScreen.ts`, `modesScreen.ts`, `careerScreen.ts`, `garageScreen.ts`, `riderScreen.ts`, `progressScreens.ts`, `settingsScreen.ts`, `pauseScreen.ts`, `resultScreens.ts`, `loadingScreen.ts` | One module per screen, each with its own CSS file. |
| `nav.ts` | Keyboard / gamepad focus movement (spatial), tabs, shortcuts. |
| `widgets.ts`, `dom.ts`, `icons.ts`, `mapArt.ts` | Shared building blocks (stars, bars, tooltips, count-up, SVG icons, procedural map art). |
| `hud.ts`, `tacho.ts`, `hud.css` | In-ride HUD and the dial / bar / digital gauge. |
| `uiSettings.ts`, `uiApply.ts` | HUD, menu and accessibility options and the code that applies them to the document. |

## Navigation contract (`nav.ts`)

* Buttons, inputs, selects and `[role=button]` are focusable targets; `data-nav-skip` removes one, `data-nav-default` marks the preferred first focus.
* A container with `data-tabs` is a tab group: Q / E, PgUp / PgDn and LB / RB click the previous / next child.
* `data-keep="name"` on a scroller keeps its scroll position across `rerender()`; `data-nid` identifies the focused element across re-renders.
* `ctx.nav.shortcuts.alt | alt2 | start` bind X / Y / Start on the pad for the open screen.
* Sliders and selects change value with left / right on the pad; typing in a text field never navigates.

## Settings

Options are `SettingDef`s (see `src/settings/schema.ts`). The settings screen is generated from the registry; nothing is hard-coded per option except the graphics preset strip, the HUD preview and the controls cheat sheet. Interface options (`hud.*`, `ui.*`, `a11y.*`) take effect through `applyUiSettings()` (root classes and CSS variables), through `Hud.applySettings()` (gauge) and through `Game.applyShowroomSettings()`. `tests/unit/uiLogic.test.ts` fails when a defined option is never read anywhere.

## Garage thumbnails

`render/bikeThumbs.ts` renders each bike once into a small render target (one per frame, cached as a JPEG data URL). `ui.thumbnails` = auto turns it off on the "Düşük" graphics preset.

## Rider gear

`data/riderGear.ts` defines and sanitises the gear (save version 5, field `rider`). The rider screen edits a draft, previews it through `Showroom.setGear()` and commits it with `SaveManager.setGear()`. In a run the same object is passed to `GameView` → `RiderModel` (sleeves, gloves, helmet, ragdoll).

## Test ids

Keep the `data-testid`s used by `tests/e2e/*.spec.ts` when restyling a screen (`btn-*`, `mode-*`, `map-*`, `bike-<id>`, `mission-*`, `set-<key>[-<option>]`, `tab-<category>`, `gear-*`, `garage-*`, `ach-*`, `lb-*`, `daily-*`).
