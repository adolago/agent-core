import { $ } from "bun"
import * as core from "@actions/core"
import { Auth } from "../src/auth"
import { Git } from "../src/git"
import { Opencode } from "../src/opencode"

try {
  await run()
  process.exit(0)
} catch (e: any) {
  console.error(e)
  let msg = e
  if (e instanceof $.ShellError) msg = e.stderr.toString()
  else if (e instanceof Error) msg = e.message
  core.setFailed(msg)
  // Also output the clean error message for the action to capture
  //core.setOutput("prepare_error", e.message);
  process.exit(1)
}

export async function run() {
  try {
    await Git.configure()
    await Opencode.start()
    await Opencode.chat(process.env.PROMPT!)
  } finally {
    Opencode.closeServer()
    await Auth.revoke()
    await Git.restore()
  }
}
