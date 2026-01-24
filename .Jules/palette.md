# Palette's Journal

## 2025-02-12 - Missing ARIA labels in icon-only buttons
**Learning:** The `IconButton` component in the UI package does not strictly enforce `aria-label`, leading to usages like the list filter clear button lacking accessible names. While some wrappers like `Tooltip` might help, raw usage is dangerous.
**Action:** Always check `IconButton` usages for `aria-label` or `title` props. Consider adding a development-time warning in `IconButton` if `aria-label` is missing.

## 2024-05-23 - Accessibility of Icon-Only Buttons
**Learning:** The `IconButton` component in this SolidJS-based UI library relies on `Kobalte` but does not enforce or automatically generate accessible names. Developers must manually add `aria-label` or `title` to ensure screen reader accessibility.
**Action:** When using `IconButton` (or any icon-only interactive element), always verify that an `aria-label` is provided. In the future, we could add a prop type check or a linter rule to enforce this.

## 2025-02-12 - Decorative SVGs and Prop Forwarding
**Learning:** Functional SVG components like `Mark`, `Logo`, and `Splash` were implemented without prop forwarding, making it impossible to add accessibility attributes like `aria-hidden` or `aria-label` without refactoring. This led to accessibility gaps where these icons were used in links or as decorative elements.
**Action:** Always ensure SVG component wrappers use `splitProps` to forward `...rest` attributes to the underlying `<svg>` element. Default decorative icons like `FileIcon` to `aria-hidden="true"` to reduce screen reader noise.
