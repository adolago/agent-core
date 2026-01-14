#!/usr/bin/env bun
import { $ } from "bun"
import pkg from "../package.json"
import { Script } from "@opencode-ai/script"
import { fileURLToPath } from "url"

const dir = fileURLToPath(new URL("..", import.meta.url))
process.chdir(dir)

const { binaries } = await import("./build.ts")
const DEFAULT_NPM_PACKAGE = "@adolago/agent-core"
const NPM_PACKAGE = process.env.AGENT_CORE_NPM_PACKAGE?.trim() || DEFAULT_NPM_PACKAGE
const SCOPE_PREFIX = NPM_PACKAGE.startsWith("@") ? NPM_PACKAGE.split("/")[0] : ""
const scopedName = (name: string) => (SCOPE_PREFIX ? `${SCOPE_PREFIX}/${name}` : name)
{
  const binarySuffix = process.env.OPENCODE_BINARY_SUFFIX?.trim()
  const osName = process.platform === "win32" ? "windows" : process.platform
  const name = [pkg.name, osName, process.arch, binarySuffix].filter(Boolean).join("-")
  console.log(`smoke test: running dist/${name}/bin/agent-core --version`)
  await $`./dist/${name}/bin/agent-core --version`
}

await $`mkdir -p ./dist/${pkg.name}`
await $`cp -r ./bin ./dist/${pkg.name}/bin`
await $`cp ./script/postinstall.mjs ./dist/${pkg.name}/postinstall.mjs`

await Bun.file(`./dist/${pkg.name}/package.json`).write(
  JSON.stringify(
    {
      name: NPM_PACKAGE,
      bin: {
        [pkg.name]: `./bin/${pkg.name}`,
      },
      scripts: {
        postinstall: "bun ./postinstall.mjs || node ./postinstall.mjs",
      },
      version: Script.version,
      optionalDependencies: Object.fromEntries(
        Object.entries(binaries).map(([name, version]) => [scopedName(name), version]),
      ),
    },
    null,
    2,
  ),
)

const tags = [Script.channel]
const skipDocker = ["1", "true", "yes"].includes((process.env.AGENT_CORE_SKIP_DOCKER ?? "").toLowerCase())

const publishFlag = Script.preview ? "--dry-run" : ""
const tasks = Object.entries(binaries).map(async ([name]) => {
  const pkgPath = `./dist/${name}/package.json`
  const raw = await Bun.file(pkgPath).text()
  const parsed = JSON.parse(raw)
  parsed.name = scopedName(name)
  await Bun.file(pkgPath).write(JSON.stringify(parsed, null, 2))
  if (process.platform !== "win32") {
    await $`chmod -R 755 .`.cwd(`./dist/${name}`)
  }
  await $`bun pm pack`.cwd(`./dist/${name}`)
  for (const tag of tags) {
    await $`npm publish ${publishFlag} *.tgz --access public --tag ${tag}`.cwd(`./dist/${name}`)
  }
})
await Promise.all(tasks)
for (const tag of tags) {
  await $`cd ./dist/${pkg.name} && bun pm pack && npm publish ${publishFlag} *.tgz --access public --tag ${tag}`
}

if (!Script.preview && !skipDocker) {
  // Create archives for GitHub release
  for (const key of Object.keys(binaries)) {
    if (key.includes("linux")) {
      await $`tar -czf ../../${key}.tar.gz *`.cwd(`dist/${key}/bin`)
    } else {
      await $`zip -r ../../${key}.zip *`.cwd(`dist/${key}/bin`)
    }
  }

  const image = "ghcr.io/adolago/agent-core"
  const platforms = "linux/amd64,linux/arm64"
  const tags = [`${image}:${Script.version}`, `${image}:latest`]
  const tagFlags = tags.flatMap((t) => ["-t", t])
  await $`docker buildx build --platform ${platforms} ${tagFlags} --push .`
}
