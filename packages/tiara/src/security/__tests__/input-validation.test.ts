import { describe, expect, it } from "@jest/globals";
import {
  validateInput,
  sanitizeString,
  validatePath,
  validateCommand,
  validateTags,
  isValidIdentifier,
  escapeForSql,
} from "../input-validation.js";

describe("input-validation", () => {
  describe("validateInput", () => {
    it("accepts valid string input", () => {
      const result = validateInput("hello world");
      expect(result.valid).toBe(true);
      expect(result.sanitized).toBe("hello world");
    });

    it("trims whitespace by default", () => {
      const result = validateInput("  trimmed  ");
      expect(result.sanitized).toBe("trimmed");
    });

    it("respects trim: false option", () => {
      const result = validateInput("  not trimmed  ", { trim: false });
      expect(result.sanitized).toBe("  not trimmed  ");
    });

    it("validates minimum length", () => {
      const result = validateInput("ab", { minLength: 5 });
      expect(result.valid).toBe(false);
      expect(result.error).toContain("at least 5 characters");
    });

    it("validates maximum length", () => {
      const result = validateInput("this is too long", { maxLength: 5 });
      expect(result.valid).toBe(false);
      expect(result.error).toContain("at most 5 characters");
    });

    it("validates pattern", () => {
      const result = validateInput("abc123", { pattern: /^[a-z]+$/ });
      expect(result.valid).toBe(false);
      expect(result.error).toContain("does not match");
    });

    it("validates allowed characters", () => {
      const result = validateInput("hello!", { allowedChars: /^[a-z]+$/ });
      expect(result.valid).toBe(false);
      expect(result.error).toContain("invalid characters");
    });

    it("handles null when not required", () => {
      const result = validateInput(null);
      expect(result.valid).toBe(true);
      expect(result.sanitized).toBe(null);
    });

    it("rejects null when required", () => {
      const result = validateInput(null, { required: true });
      expect(result.valid).toBe(false);
      expect(result.error).toContain("required");
    });

    it("rejects non-string input", () => {
      const result = validateInput(123);
      expect(result.valid).toBe(false);
      expect(result.error).toContain("must be a string");
    });
  });

  describe("sanitizeString", () => {
    it("removes HTML tags", () => {
      expect(sanitizeString("hello<script>alert(1)</script>")).toBe("helloscriptalert(1)/script");
    });

    it("removes control characters", () => {
      expect(sanitizeString("hello\x00\x1fworld")).toBe("helloworld");
    });

    it("removes line/paragraph separators", () => {
      expect(sanitizeString("hello\u2028\u2029world")).toBe("helloworld");
    });

    it("trims whitespace", () => {
      expect(sanitizeString("  hello  ")).toBe("hello");
    });

    it("handles normal strings", () => {
      expect(sanitizeString("normal string")).toBe("normal string");
    });
  });

  describe("validatePath", () => {
    it("accepts valid paths", () => {
      const result = validatePath("src/file.ts");
      expect(result.valid).toBe(true);
      expect(result.sanitized).toBe("src/file.ts");
    });

    it("normalizes Windows paths", () => {
      const result = validatePath("src\\dir\\file.ts");
      expect(result.sanitized).toBe("src/dir/file.ts");
    });

    it("removes duplicate slashes", () => {
      const result = validatePath("src//dir///file.ts");
      expect(result.sanitized).toBe("src/dir/file.ts");
    });

    it("rejects path traversal with ..", () => {
      const result = validatePath("../../../etc/passwd");
      expect(result.valid).toBe(false);
      expect(result.error).toContain("traversal");
    });

    it("rejects path traversal with ~", () => {
      const result = validatePath("~/private/file");
      expect(result.valid).toBe(false);
      expect(result.error).toContain("traversal");
    });

    it("rejects paths with null bytes", () => {
      const result = validatePath("file\x00.txt");
      expect(result.valid).toBe(false);
      expect(result.error).toContain("null bytes");
    });

    it("rejects paths that are too long", () => {
      const longPath = "a".repeat(5000);
      const result = validatePath(longPath);
      expect(result.valid).toBe(false);
      expect(result.error).toContain("too long");
    });

    it("validates against allowed base", () => {
      const result = validatePath("/etc/passwd", "/home/user");
      expect(result.valid).toBe(false);
      expect(result.error).toContain("outside allowed directory");
    });

    it("accepts paths within allowed base", () => {
      const result = validatePath("/home/user/file.txt", "/home/user");
      expect(result.valid).toBe(true);
    });

    it("allows relative paths with allowed base", () => {
      const result = validatePath("subdir/file.txt", "/home/user");
      expect(result.valid).toBe(true);
    });
  });

  describe("validateCommand", () => {
    it("accepts safe commands", () => {
      const result = validateCommand("ls -la");
      expect(result.valid).toBe(true);
    });

    it("rejects empty commands", () => {
      const result = validateCommand("   ");
      expect(result.valid).toBe(false);
      expect(result.error).toContain("Empty");
    });

    it("validates against whitelist", () => {
      const result = validateCommand("rm -rf /", ["ls", "cat", "grep"]);
      expect(result.valid).toBe(false);
      expect(result.error).toContain("not allowed");
    });

    it("accepts whitelisted commands", () => {
      const result = validateCommand("ls -la", ["ls", "cat"]);
      expect(result.valid).toBe(true);
    });

    it("rejects shell operators", () => {
      const testCases = [
        "ls; rm -rf /",
        "cat file | grep secret",
        "echo `whoami`",
        "echo $(id)",
        "cmd && evil",
        "cmd || evil",
      ];

      for (const cmd of testCases) {
        const result = validateCommand(cmd);
        expect(result.valid).toBe(false);
        expect(result.error).toContain("dangerous");
      }
    });

    it("rejects newlines", () => {
      const result = validateCommand("ls\nrm -rf /");
      expect(result.valid).toBe(false);
    });

    it("rejects append redirection", () => {
      const result = validateCommand("echo secret >> file");
      expect(result.valid).toBe(false);
    });
  });

  describe("validateTags", () => {
    it("accepts valid tags", () => {
      const result = validateTags(["tag1", "tag-2", "tag_3", "tag.4", "tag:5"]);
      expect(result.valid).toBe(true);
      expect(result.sanitized).toEqual(["tag1", "tag-2", "tag_3", "tag.4", "tag:5"]);
    });

    it("rejects non-array input", () => {
      const result = validateTags("not-an-array");
      expect(result.valid).toBe(false);
      expect(result.error).toContain("must be an array");
    });

    it("rejects non-string tags", () => {
      const result = validateTags(["valid", 123, "also-valid"]);
      expect(result.valid).toBe(false);
      expect(result.error).toContain("must be a string");
    });

    it("skips empty tags", () => {
      const result = validateTags(["tag1", "", "  ", "tag2"]);
      expect(result.valid).toBe(true);
      expect(result.sanitized).toEqual(["tag1", "tag2"]);
    });

    it("rejects tags that are too long", () => {
      const result = validateTags(["a".repeat(101)]);
      expect(result.valid).toBe(false);
      expect(result.error).toContain("too long");
    });

    it("rejects tags with special characters", () => {
      const result = validateTags(["valid", "invalid@tag", "another"]);
      expect(result.valid).toBe(false);
      expect(result.error).toContain("Invalid tag");
    });

    it("trims whitespace from tags", () => {
      const result = validateTags(["  trimmed  "]);
      expect(result.sanitized).toEqual(["trimmed"]);
    });
  });

  describe("isValidIdentifier", () => {
    it("accepts valid identifiers", () => {
      expect(isValidIdentifier("myVar")).toBe(true);
      expect(isValidIdentifier("_private")).toBe(true);
      expect(isValidIdentifier("camelCase")).toBe(true);
      expect(isValidIdentifier("with_underscore")).toBe(true);
      expect(isValidIdentifier("with-hyphen")).toBe(true);
      expect(isValidIdentifier("var123")).toBe(true);
    });

    it("rejects invalid identifiers", () => {
      expect(isValidIdentifier("123start")).toBe(false);
      expect(isValidIdentifier("has space")).toBe(false);
      expect(isValidIdentifier("special@char")).toBe(false);
      expect(isValidIdentifier("-starts-with-hyphen")).toBe(false);
    });

    it("rejects identifiers that are too long", () => {
      expect(isValidIdentifier("a".repeat(257))).toBe(false);
    });

    it("accepts identifiers at max length", () => {
      expect(isValidIdentifier("a".repeat(256))).toBe(true);
    });
  });

  describe("escapeForSql", () => {
    it("escapes single quotes", () => {
      expect(escapeForSql("it's")).toBe("it''s");
    });

    it("escapes backslashes", () => {
      expect(escapeForSql("path\\to\\file")).toBe("path\\\\to\\\\file");
    });

    it("removes null bytes", () => {
      expect(escapeForSql("null\x00byte")).toBe("nullbyte");
    });

    it("escapes newlines", () => {
      expect(escapeForSql("line1\nline2")).toBe("line1\\nline2");
    });

    it("escapes carriage returns", () => {
      expect(escapeForSql("line1\rline2")).toBe("line1\\rline2");
    });

    it("escapes EOF character", () => {
      expect(escapeForSql("data\x1a")).toBe("data\\Z");
    });

    it("handles normal strings", () => {
      expect(escapeForSql("normal string")).toBe("normal string");
    });

    it("handles multiple escapes", () => {
      expect(escapeForSql("it's a\\path\nwith\x00nulls")).toBe("it''s a\\\\path\\nwithnulls");
    });
  });
});
