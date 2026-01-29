import Foundation

enum ZeeEnv {
    static func path(_ key: String) -> String? {
        // Normalize env overrides once so UI + file IO stay consistent.
        guard let raw = getenv(key) else { return nil }
        let value = String(cString: raw).trimmingCharacters(in: .whitespacesAndNewlines)
        guard !value.isEmpty
        else {
            return nil
        }
        return value
    }
}

enum ZeePaths {
    private static let configPathEnv = ["ZEE_CONFIG_PATH", "MOLTBOT_CONFIG_PATH", "CLAWDBOT_CONFIG_PATH"]
    private static let stateDirEnv = ["ZEE_STATE_DIR", "MOLTBOT_STATE_DIR", "CLAWDBOT_STATE_DIR"]

    private static func resolveEnvPath(_ keys: [String]) -> String? {
        for key in keys {
            if let value = ZeeEnv.path(key) {
                return value
            }
        }
        return nil
    }

    static var stateDirURL: URL {
        if let override = self.resolveEnvPath(self.stateDirEnv) {
            return URL(fileURLWithPath: override, isDirectory: true)
        }
        let home = FileManager().homeDirectoryForCurrentUser
        let preferred = home.appendingPathComponent(".zee", isDirectory: true)
        if FileManager().fileExists(atPath: preferred.path) {
            return preferred
        }
        let legacyDirs = [".moltbot", ".clawdbot"]
        for dir in legacyDirs {
            let candidate = home.appendingPathComponent(dir, isDirectory: true)
            if FileManager().fileExists(atPath: candidate.path) {
                return candidate
            }
        }
        return preferred
    }

    static var configURL: URL {
        if let override = self.resolveEnvPath(self.configPathEnv) {
            return URL(fileURLWithPath: override)
        }
        let home = FileManager().homeDirectoryForCurrentUser
        let stateDirs = [
            home.appendingPathComponent(".zee", isDirectory: true),
            home.appendingPathComponent(".moltbot", isDirectory: true),
            home.appendingPathComponent(".clawdbot", isDirectory: true),
        ]
        let configNames = ["zee.json", "moltbot.json", "clawdbot.json"]
        for dir in stateDirs {
            for name in configNames {
                let candidate = dir.appendingPathComponent(name)
                if FileManager().fileExists(atPath: candidate.path) {
                    return candidate
                }
            }
        }
        return self.stateDirURL.appendingPathComponent("zee.json")
    }

    static var workspaceURL: URL {
        self.stateDirURL.appendingPathComponent("workspace", isDirectory: true)
    }
}
