// swift-tools-version: 6.2

import PackageDescription

let package = Package(
    name: "ZeeKit",
    platforms: [
        .iOS(.v18),
        .macOS(.v15),
    ],
    products: [
        .library(name: "ZeeProtocol", targets: ["ZeeProtocol"]),
        .library(name: "ZeeKit", targets: ["ZeeKit"]),
        .library(name: "ZeeChatUI", targets: ["ZeeChatUI"]),
    ],
    dependencies: [
        .package(url: "https://github.com/steipete/ElevenLabsKit", exact: "0.1.0"),
        .package(url: "https://github.com/gonzalezreal/textual", exact: "0.3.1"),
    ],
    targets: [
        .target(
            name: "ZeeProtocol",
            path: "Sources/ZeeProtocol",
            swiftSettings: [
                .enableUpcomingFeature("StrictConcurrency"),
            ]),
        .target(
            name: "ZeeKit",
            dependencies: [
                "ZeeProtocol",
                .product(name: "ElevenLabsKit", package: "ElevenLabsKit"),
            ],
            path: "Sources/ZeeKit",
            resources: [
                .process("Resources"),
            ],
            swiftSettings: [
                .enableUpcomingFeature("StrictConcurrency"),
            ]),
        .target(
            name: "ZeeChatUI",
            dependencies: [
                "ZeeKit",
                .product(
                    name: "Textual",
                    package: "textual",
                    condition: .when(platforms: [.macOS, .iOS])),
            ],
            path: "Sources/ZeeChatUI",
            swiftSettings: [
                .enableUpcomingFeature("StrictConcurrency"),
            ]),
        .testTarget(
            name: "ZeeKitTests",
            dependencies: ["ZeeKit", "ZeeChatUI"],
            path: "Tests/ZeeKitTests",
            swiftSettings: [
                .enableUpcomingFeature("StrictConcurrency"),
                .enableExperimentalFeature("SwiftTesting"),
            ]),
    ])
