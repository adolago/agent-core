import path from "path"

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

const [, , patchFile, mainWasm, ...wasmFiles] = process.argv

if (!patchFile || !mainWasm) {
  console.error("Usage: patch-wasm.ts <patch_file> <main_wasm> <wasm_paths...>")
  process.exit(2)
}

const file = Bun.file(patchFile)
if (!(await file.exists())) {
  console.error(`[patch-wasm] file not found: ${patchFile}`)
  process.exit(1)
}

const replacements = new Map<string, string>()

// Some bundles reference a generic tree-sitter.wasm, but Nix installs hashed tree-sitter-*.wasm.
replacements.set("tree-sitter.wasm", mainWasm)

for (const wasmPath of wasmFiles) {
  if (!wasmPath) continue
  const base = path.basename(wasmPath)
  if (!base) continue
  replacements.set(base, wasmPath)
}

let content = await file.text()
let total = 0

for (const [needle, replacement] of Array.from(replacements.entries()).sort((a, b) => b[0].length - a[0].length)) {
  if (!needle || !replacement) continue

  const pattern = new RegExp(String.raw`(['"\`])(?:\./|\.\./)?${escapeRegExp(needle)}\1`, "g")
  let count = 0
  content = content.replace(pattern, (_match, quote: string) => {
    count += 1
    return `${quote}${replacement}${quote}`
  })
  total += count
}

if (total === 0) {
  console.log(`[patch-wasm] no changes: ${patchFile}`)
  process.exit(0)
}

await Bun.write(patchFile, content)
console.log(`[patch-wasm] patched ${patchFile} (${total} replacement(s))`)

