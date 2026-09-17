# Together Notes AI engineering contract

This file is the persistent product and UI contract for every AI coding task in this repository. Read it before changing the app.

## Working mode

Use a **contract → shared primitive → page composition → visual QA** workflow.

1. Before editing a page, search the repository for the same interaction or visual pattern.
2. If a shared primitive exists, use it. Do not recreate a page-local approximation.
3. If a pattern will appear on two or more pages, improve or add the shared primitive first, then migrate all affected pages in the same change.
4. Keep page files responsible for content and layout; keep interaction geometry, icon alignment, and motion in shared components.
5. A requested visual correction becomes the new default for that pattern across the product unless the request explicitly limits its scope.

## Delivery default

After a requested change is implemented and verified, commit all in-scope files, push the current branch, and follow the repository's configured deployment workflow by default. For `main`, a successful push is the production deployment trigger through GitHub Actions. Confirm the resulting CI, web/API deployment, and WeChat upload status before reporting completion. Do not include unrelated user changes in the commit, and do not silently treat a local build as a deployment.

## Canonical UI primitives

- Peer-view tab switching uses `src/components/JellyTabs.vue`. This includes content tabs, category tabs, and mode tabs. Do not hand-code another active pill or sliding indicator.
- Circular done / not-done state uses `src/components/StatusIcon.vue`. Do not redraw its check mark in page CSS.
- Subpage navigation uses `src/components/SubpageHeader.vue`.
- Icons must use the assets in `src/static/nav-icons` or a reusable CSS/image component. Do not use font glyphs such as `♡`, `✓`, or emoji as interface icons because their geometry changes by platform.

## Interaction and visual rules

- Interactive controls have a minimum 44 × 44 CSS-pixel hit area. The visible glyph is optically centered inside that area.
- Tab indicators use the shared jelly motion. Text, indicator, and hit target stay centered at 320–430 px viewport widths.
- A completed state uses both an icon and text where text is already present. Disabled must not make the state icon disappear.
- Profile fields are read-only by default. Show an explicit edit action; reveal input plus save/cancel actions only while editing.
- Search results with citations render as compact, one-result-per-row links. Do not repeat a generated summary above a local result list. A model-only answer may render prose when there are no citations.
- List metadata and tags must stay vertically centered, single-line, ellipsized, and contained within the card at narrow widths.
- Custom-navigation subpages keep `SubpageHeader` as the sticky safe-area guard. Scrolled content must never render beneath the WeChat status bar or menu capsule.
- Do not repeat topic/source tags in a card footer when the same metadata is already visible at the top of the card.
- Preserve the product palette and geometry already used by the shared primitives: dark brown `#494032`, butter `#f7e7ad`, canvas `#faf8f2`, white cards, 16–22 px card radii.

## Definition of done

For UI work, run at least:

```text
npm run type-check
npm test
npm run build:h5
```

Use `npm run qa:mobile` for changed responsive flows when its fixture covers the page. Inspect the affected 320 px and 390/430 px captures, not only the build output. Regenerate raster icons with `npm run qa:icons` after changing an SVG source.

Do not call a UI change complete while the same pattern remains inconsistent on another visible page.
