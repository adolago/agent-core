// swift-tools-version: 6.2
// Package manifest for the Zee macOS companion (menu bar app + IPC library).

import PackageDescription

let package = Package(
    name: "Zee",
    platforms: [
        .macOS(.v15),
    ],
    products: [
        .library(name: "ZeeIPC", targets: ["ZeeIPC"]),
        .library(name: "ZeeDiscovery", targets: ["ZeeDiscovery"]),
        .executable(name: "Zee", targets: ["Zee"]),
        .executable(name: "zee-mac", targets: ["ZeeMacCLI"]),
    ],
    dependencies: [
        .package(url: "https://github.com/orchetect/MenuBarExtraAccess", exact: "1.2.2"),
        .package(url: "https://github.com/swiftlang/swift-subprocess.git", from: "0.1.0"),
        .package(url: "https://github.com/apple/swift-log.git", from: "1.8.0"),
        .package(url: "https://github.com/sparkle-project/Sparkle", from: "2.8.1"),
        .package(url: "https://github.com/steipete/Peekaboo.git", branch: "main"),
        .package(path: "../shared/ZeeKit"),
        .package(path: "../../Swabble"),
    ],
    targets: [
        .target(
            name: "ZeeIPC",
            dependencies: [],
            swiftSettings: [
                .enableUpcomingFeature("StrictConcurrency"),
            ]),
        .target(
            name: "ZeeDiscovery",
            dependencies: [
                .product(name: "ZeeKit", package: "ZeeKit"),
            ],
            path: "Sources/ZeeDiscovery",
            swiftSettings: [
                .enableUpcomingFeature("StrictConcurrency"),
            ]),
        .executableTarget(
            name: "Zee",
            dependencies: [
                "ZeeIPC",
                "ZeeDiscovery",
                .product(name: "ZeeKit", package: "ZeeKit"),
                .product(name: "ZeeChatUI", package: "ZeeKit"),
                .product(name: "ZeeProtocol", package: "ZeeKit"),
                .product(name: "SwabbleKit", package: "swabble"),
                .product(name: "MenuBarExtraAccess", package: "MenuBarExtraAccess"),
                .product(name: "Subprocess", package: "swift-subprocess"),
                .product(name: "Logging", package: "swift-log"),
                .product(name: "Sparkle", package: "Sparkle"),
                .product(name: "PeekabooBridge", package: "Peekaboo"),
                .product(name: "PeekabooAutomationKit", package: "Peekaboo"),
            ],
            exclude: [
                "Resources/Info.plist",
            ],
            resources: [
                .copy("Resources/Zee.icns"),
                .copy("Resources/DeviceModels"),
            ],
            swiftSettings: [
                .enableUpcomingFeature("StrictConcurrency"),
            ]),
        .executableTarget(
            name: "ZeeMacCLI",
            dependencies: [
                "ZeeDiscovery",
                .product(name: "ZeeKit", package: "ZeeKit"),
                .product(name: "ZeeProtocol", package: "ZeeKit"),
            ],
            path: "Sources/ZeeMacCLI",
            swiftSettings: [
                .enableUpcomingFeature("StrictConcurrency"),
            ]),
        .testTarget(
            name: "ZeeIPCTests",
            dependencies: [
                "ZeeIPC",
                "Zee",
                "ZeeDiscovery",
                .product(name: "ZeeProtocol", package: "ZeeKit"),
                .product(name: "SwabbleKit", package: "swabble"),
            ],
            swiftSettings: [
                .enableUpcomingFeature("StrictConcurrency"),
                .enableExperimentalFeature("SwiftTesting"),
            ]),
    ])
