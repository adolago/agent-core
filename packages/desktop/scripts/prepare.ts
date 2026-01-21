#!/usr/bin/env bun
import { $ } from "bun"

import { copyBinaryToSidecarFolder, getCurrentSidecar, windowsify } from "./utils"

const sidecarConfig = getCurrentSidecar()

const dir = "src-tauri/target/agent-core-binaries"

await $`mkdir -p ${dir}`
await $`gh run download ${Bun.env.GITHUB_RUN_ID} -n agent-core-cli`.cwd(dir)

await copyBinaryToSidecarFolder(windowsify(`${dir}/${sidecarConfig.ocBinary}/bin/agent-core`))
