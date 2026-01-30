export const PLACEHOLDERS = [
  "Type a message... (Enter to send)",
  "Mention @file to add context...",
  "Use / for slash commands...",
  "Paste images or text here...",
  "Type :help for options...",
  "Ask a question or give a command...",
  "Use Space to see keybindings...",
  "Type :new to start fresh...",
]

export function getRandomPlaceholder(): string {
  return PLACEHOLDERS[Math.floor(Math.random() * PLACEHOLDERS.length)]
}
