import { checksum } from "@opencode-ai/util/encode"
import { FileDiff } from "@pierre/diffs"
import { createMediaQuery } from "@solid-primitives/media"
import { createEffect, createMemo, onCleanup, splitProps } from "solid-js"
import { createDefaultOptions, type DiffProps, styleVariables } from "../pierre"
import { getWorkerPool } from "../pierre/worker"

export function Diff<T>(props: DiffProps<T>) {
  let container!: HTMLDivElement
  const [local, others] = splitProps(props, ["before", "after", "class", "classList", "annotations"])

  const mobile = createMediaQuery("(max-width: 640px)")

  const options = createMemo(() => {
    const opts = {
      ...createDefaultOptions(props.diffStyle),
      ...others,
    }
    if (!mobile()) return opts
    return {
      ...opts,
      disableLineNumbers: true,
    }
  })

  // Memoize contents to avoid recalculation
  const beforeContents = createMemo(() => (typeof local.before?.contents === "string" ? local.before.contents : ""))
  const afterContents = createMemo(() => (typeof local.after?.contents === "string" ? local.after.contents : ""))

  // Memoize checksums to prevent expensive recalculation on every render
  const beforeChecksum = createMemo(() => checksum(beforeContents()))
  const afterChecksum = createMemo(() => checksum(afterContents()))

  let instance: FileDiff<T> | undefined

  createEffect(() => {
    const opts = options()
    const workerPool = getWorkerPool(props.diffStyle)
    const annotations = local.annotations
    const bContents = beforeContents()
    const aContents = afterContents()
    const bChecksum = beforeChecksum()
    const aChecksum = afterChecksum()

    instance?.cleanUp()
    instance = new FileDiff<T>(opts, workerPool)

    container.innerHTML = ""
    instance.render({
      oldFile: {
        ...local.before,
        contents: bContents,
        cacheKey: bChecksum,
      },
      newFile: {
        ...local.after,
        contents: aContents,
        cacheKey: aChecksum,
      },
      lineAnnotations: annotations,
      containerWrapper: container,
    })
  })

  onCleanup(() => {
    instance?.cleanUp()
  })

  return <div data-component="diff" style={styleVariables} ref={container} />
}
