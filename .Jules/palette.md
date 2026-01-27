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
