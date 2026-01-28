import { describe, expect, test } from "bun:test"
import { createFrames } from "../../../src/cli/cmd/tui/ui/spinner"

describe("Carousel Spinner Animation", () => {
  test("animation has correct number of frames (width + activeCount - 1)", () => {
    const frames = createFrames({
      animation: "carousel",
      width: 10,
      carouselActiveCount: 4,
      style: "blocks",
    })

    // 10 + 4 - 1 = 13 frames
    expect(frames.length).toBe(13)
  })

  test("blocks enter from right one-by-one", () => {
    const frames = createFrames({
      animation: "carousel",
      width: 10,
      carouselActiveCount: 4,
      style: "blocks",
    })

    // Enter phase: frames 0-3
    expect(frames[0]).toBe("⬝⬝⬝⬝⬝⬝⬝⬝⬝■") // 1 block
    expect(frames[1]).toBe("⬝⬝⬝⬝⬝⬝⬝⬝■■") // 2 blocks
    expect(frames[2]).toBe("⬝⬝⬝⬝⬝⬝⬝■■■") // 3 blocks
    expect(frames[3]).toBe("⬝⬝⬝⬝⬝⬝■■■■") // 4 blocks (full group)
  })

  test("full group traverses right-to-left", () => {
    const frames = createFrames({
      animation: "carousel",
      width: 10,
      carouselActiveCount: 4,
      style: "blocks",
    })

    // Traverse phase: group slides left
    expect(frames[3]).toBe("⬝⬝⬝⬝⬝⬝■■■■") // rightmost at 9
    expect(frames[4]).toBe("⬝⬝⬝⬝⬝■■■■⬝") // head at 5
    expect(frames[5]).toBe("⬝⬝⬝⬝■■■■⬝⬝") // head at 4
    expect(frames[6]).toBe("⬝⬝⬝■■■■⬝⬝⬝") // head at 3
    expect(frames[9]).toBe("■■■■⬝⬝⬝⬝⬝⬝") // leftmost at 0
  })

  test("blocks exit on left one-by-one", () => {
    const frames = createFrames({
      animation: "carousel",
      width: 10,
      carouselActiveCount: 4,
      style: "blocks",
    })

    // Exit phase: frames 9-12
    expect(frames[9]).toBe("■■■■⬝⬝⬝⬝⬝⬝")  // 4 blocks at left edge
    expect(frames[10]).toBe("■■■⬝⬝⬝⬝⬝⬝⬝") // 3 blocks (1 exited)
    expect(frames[11]).toBe("■■⬝⬝⬝⬝⬝⬝⬝⬝") // 2 blocks (2 exited)
    expect(frames[12]).toBe("■⬝⬝⬝⬝⬝⬝⬝⬝⬝") // 1 block (3 exited)
  })

  test("each frame has correct number of active blocks", () => {
    const frames = createFrames({
      animation: "carousel",
      width: 10,
      carouselActiveCount: 4,
      style: "blocks",
    })

    // Count active blocks in each frame
    const counts = frames.map((f) => [...f].filter((c) => c === "■").length)

    // Enter: 1, 2, 3, 4
    expect(counts[0]).toBe(1)
    expect(counts[1]).toBe(2)
    expect(counts[2]).toBe(3)
    expect(counts[3]).toBe(4)

    // Traverse: all 4
    for (let i = 3; i <= 9; i++) {
      expect(counts[i]).toBe(4)
    }

    // Exit: 4, 3, 2, 1
    expect(counts[9]).toBe(4)
    expect(counts[10]).toBe(3)
    expect(counts[11]).toBe(2)
    expect(counts[12]).toBe(1)
  })
})
