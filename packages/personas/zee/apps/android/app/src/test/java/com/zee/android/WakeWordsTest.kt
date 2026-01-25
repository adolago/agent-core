package com.zee.android

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class WakeWordsTest {
  @Test
  fun parseCommaSeparatedTrimsAndDropsEmpty() {
    assertEquals(listOf("zee", "claude"), WakeWords.parseCommaSeparated("  zee , claude, ,  "))
  }

  @Test
  fun sanitizeTrimsCapsAndFallsBack() {
    val defaults = listOf("zee", "claude")
    val long = "x".repeat(WakeWords.maxWordLength + 10)
    val words = listOf(" ", "  hello  ", long)

    val sanitized = WakeWords.sanitize(words, defaults)
    assertEquals(2, sanitized.size)
    assertEquals("hello", sanitized[0])
    assertEquals("x".repeat(WakeWords.maxWordLength), sanitized[1])

    assertEquals(defaults, WakeWords.sanitize(listOf(" ", ""), defaults))
  }

  @Test
  fun sanitizeLimitsWordCount() {
    val defaults = listOf("zee")
    val words = (1..(WakeWords.maxWords + 5)).map { "w$it" }
    val sanitized = WakeWords.sanitize(words, defaults)
    assertEquals(WakeWords.maxWords, sanitized.size)
    assertEquals("w1", sanitized.first())
    assertEquals("w${WakeWords.maxWords}", sanitized.last())
  }

  @Test
  fun parseIfChangedSkipsWhenUnchanged() {
    val current = listOf("zee", "claude")
    val parsed = WakeWords.parseIfChanged(" zee , claude ", current)
    assertNull(parsed)
  }

  @Test
  fun parseIfChangedReturnsUpdatedList() {
    val current = listOf("zee")
    val parsed = WakeWords.parseIfChanged(" zee , jarvis ", current)
    assertEquals(listOf("zee", "jarvis"), parsed)
  }
}
