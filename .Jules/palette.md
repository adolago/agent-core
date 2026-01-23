# Palette's Journal

## 2025-02-12 - Missing ARIA labels in icon-only buttons
**Learning:** The `IconButton` component in the UI package does not strictly enforce `aria-label`, leading to usages like the list filter clear button lacking accessible names. While some wrappers like `Tooltip` might help, raw usage is dangerous.
**Action:** Always check `IconButton` usages for `aria-label` or `title` props. Consider adding a development-time warning in `IconButton` if `aria-label` is missing.
