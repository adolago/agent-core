# Palette's Journal

## 2026-01-14 - Blocking Prompts vs. Inline Inputs
**Learning:** Using `window.prompt()` creates a modal blocking state that interrupts the user's flow and is often flagged by popup blockers or feels "unsafe" to modern users. It also lacks accessibility controls (ARIA labels, proper focus management).
**Action:** Replace blocking prompts with inline, labeled input fields that allow users to maintain context and control. Use standard form elements which are naturally accessible.

## 2026-01-24 - Dynamic List Rendering & Accessibility
**Learning:** In vanilla JS applications (like the browser dashboard), resetting `innerHTML` to update a list destroys the DOM elements, causing keyboard focus to be lost and screen readers to lose context. This is especially problematic for high-frequency updates (e.g., real-time status).
**Action:** Implement intelligent DOM reconciliation: check if an element with a stable ID exists. If so, update only the changed attributes (text, class). If not, append it. This preserves focus and selection.
