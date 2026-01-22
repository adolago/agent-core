## 2024-05-23 - Accessibility of Icon-Only Buttons
**Learning:** The `IconButton` component in this SolidJS-based UI library relies on `Kobalte` but does not enforce or automatically generate accessible names. Developers must manually add `aria-label` or `title` to ensure screen reader accessibility.
**Action:** When using `IconButton` (or any icon-only interactive element), always verify that an `aria-label` is provided. In the future, we could add a prop type check or a linter rule to enforce this.
