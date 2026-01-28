# Palette's Journal

## 2025-02-13 - [Split Divider Accessibility]
**Learning:** Custom splitters/dividers often lack keyboard accessibility. Adding `role="separator"`, `tabindex="0"`, and `keydown` handlers for Arrow keys makes them usable for everyone.
**Action:** When creating custom interactive elements, always implement keyboard equivalents for mouse actions.

## 2025-02-12 - Missing ARIA labels in icon-only buttons
**Learning:** The `IconButton` component in the UI package does not strictly enforce `aria-label`, leading to usages like the list filter clear button lacking accessible names. While some wrappers like `Tooltip` might help, raw usage is dangerous.
**Action:** Always check `IconButton` usages for `aria-label` or `title` props. Consider adding a development-time warning in `IconButton` if `aria-label` is missing.

## 2024-05-23 - Accessibility of Icon-Only Buttons
**Learning:** The `IconButton` component in this SolidJS-based UI library relies on `Kobalte` but does not enforce or automatically generate accessible names. Developers must manually add `aria-label` or `title` to ensure screen reader accessibility.
**Action:** When using `IconButton` (or any icon-only interactive element), always verify that an `aria-label` is provided. In the future, we could add a prop type check or a linter rule to enforce this.

## 2025-10-27 - Auto-expanding Textareas and Lit Refs
**Learning:** Chat inputs that don't auto-expand are a common UX pain point. Implementing this in Lit requires imperative DOM manipulation. Using the `ref` directive allows executing logic on every render/update, which is crucial for handling external state resets (like clearing the draft after sending). Binding `style` attributes conditionally can be flaky if the attribute is removed by Lit, so direct DOM manipulation via `ref` is more robust for persistent visual state.
**Action:** Use `ref` for auto-resize logic in Lit components to ensure the UI stays in sync with state, especially for "reset" scenarios.

## 2025-02-14 - Manual Icon Buttons in Lit
**Learning:** In the Lit-based UI (`zee` persona), icon-only buttons are often implemented as standard `<button>` elements with classes (e.g., `btn btn--icon`) rather than a dedicated component. These manual implementations frequently lack `aria-label`, relying only on `title` which is insufficient for all screen readers.
**Action:** When working with `btn--icon` classes, explicitly verify that `aria-label` is present and descriptive.
