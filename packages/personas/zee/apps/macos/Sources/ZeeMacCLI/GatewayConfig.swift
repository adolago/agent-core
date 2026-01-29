import Foundation

struct GatewayConfig {
    var mode: String?
    var bind: String?
    var port: Int?
    var remoteUrl: String?
    var token: String?
    var password: String?
    var remoteToken: String?
    var remotePassword: String?
}

struct GatewayEndpoint {
    let url: URL
    let token: String?
    let password: String?
    let mode: String
}

func loadGatewayConfig() -> GatewayConfig {
    for url in resolveGatewayConfigCandidates() {
        guard let data = try? Data(contentsOf: url) else { continue }
        guard let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            continue
        }
        return parseGatewayConfig(json)
    }
    return GatewayConfig()
}

func parseInt(_ value: Any?) -> Int? {
    switch value {
    case let number as Int:
        number
    case let number as Double:
        Int(number)
    case let raw as String:
        Int(raw.trimmingCharacters(in: .whitespacesAndNewlines))
    default:
        nil
    }
}

private func resolveGatewayConfigCandidates() -> [URL] {
    let envKeys = ["ZEE_CONFIG_PATH", "MOLTBOT_CONFIG_PATH", "CLAWDBOT_CONFIG_PATH"]
    var candidates: [URL] = []
    let env = ProcessInfo.processInfo.environment
    for key in envKeys {
        if let raw = env[key]?.trimmingCharacters(in: .whitespacesAndNewlines),
           !raw.isEmpty
        {
            candidates.append(URL(fileURLWithPath: raw))
        }
    }

    let home = FileManager().homeDirectoryForCurrentUser
    let stateDirs = [".zee", ".moltbot", ".clawdbot"]
    let configNames = ["zee.json", "moltbot.json", "clawdbot.json"]
    for dir in stateDirs {
        for name in configNames {
            candidates.append(home.appendingPathComponent(dir).appendingPathComponent(name))
        }
    }
    return candidates
}

private func parseGatewayConfig(_ json: [String: Any]) -> GatewayConfig {
    var cfg = GatewayConfig()
    if let gateway = json["gateway"] as? [String: Any] {
        cfg.mode = gateway["mode"] as? String
        cfg.bind = gateway["bind"] as? String
        cfg.port = gateway["port"] as? Int ?? parseInt(gateway["port"])

        if let auth = gateway["auth"] as? [String: Any] {
            cfg.token = auth["token"] as? String
            cfg.password = auth["password"] as? String
        }
        if let remote = gateway["remote"] as? [String: Any] {
            cfg.remoteUrl = remote["url"] as? String
            cfg.remoteToken = remote["token"] as? String
            cfg.remotePassword = remote["password"] as? String
        }
    }
    return cfg
}
