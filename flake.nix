{
  description = "Agent-Core: OpenCode engine with Personas system";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixpkgs-unstable";
  };

  outputs =
    {
      self,
      nixpkgs,
      ...
    }:
    let
      systems = [
        "aarch64-linux"
        "x86_64-linux"
        "aarch64-darwin"
        "x86_64-darwin"
      ];
      inherit (nixpkgs) lib;
      forEachSystem = lib.genAttrs systems;
      pkgsFor = system: nixpkgs.legacyPackages.${system};
      packageJson = builtins.fromJSON (builtins.readFile ./packages/opencode/package.json);
      bunTarget = {
        "aarch64-linux" = "bun-linux-arm64";
        "x86_64-linux" = "bun-linux-x64";
        "aarch64-darwin" = "bun-darwin-arm64";
        "x86_64-darwin" = "bun-darwin-x64";
      };
      defaultNodeModules = "sha256-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";
      hashesFile = "${./nix}/hashes.json";
      hashesData =
        if builtins.pathExists hashesFile then builtins.fromJSON (builtins.readFile hashesFile) else { };
      nodeModulesHash = hashesData.nodeModules or defaultNodeModules;
      modelsDev = forEachSystem (
        system:
        let
          pkgs = pkgsFor system;
        in
        pkgs."models-dev"
      );

      # ==========================================================================
      # Stock Dependencies for Personas System
      # These are the same packages clients install via their package manager
      # ==========================================================================
      stockDeps = system:
        let
          pkgs = pkgsFor system;
          isLinux = builtins.elem system [ "x86_64-linux" "aarch64-linux" ];
          isDarwin = builtins.elem system [ "x86_64-darwin" "aarch64-darwin" ];
        in
        {
          # Terminal & TUI
          wezterm = pkgs.wezterm;           # Terminal emulator with pane orchestration
          yazi = pkgs.yazi;                 # File manager

          # Vector Database
          qdrant = pkgs.qdrant;             # Semantic memory storage

          # Development Tools
          ripgrep = pkgs.ripgrep;           # Fast search (used by opencode)
          fd = pkgs.fd;                     # Fast find
          fzf = pkgs.fzf;                   # Fuzzy finder
          jq = pkgs.jq;                     # JSON processing
          gh = pkgs.gh;                     # GitHub CLI

          # Python Environment (for OpenBB, NautilusTrader)
          python = pkgs.python312;
          pythonWithPackages = pkgs.python312.withPackages (ps: with ps; [
            pip
            virtualenv
            # Note: openbb and nautilus-trader are installed via pip
            # as they're not in nixpkgs. See setup instructions below.
          ]);

          # System utilities
          coreutils = pkgs.coreutils;
        };

      # Python packages that need pip install (not in nixpkgs)
      # Document these for manual installation
      pythonPipPackages = [
        "openbb"              # OpenBB Platform for Stanley
        "nautilus-trader"     # NautilusTrader for Stanley
      ];
    in
    {
      # ========================================================================
      # Development Shells
      # ========================================================================
      devShells = forEachSystem (
        system:
        let
          pkgs = pkgsFor system;
          deps = stockDeps system;
        in
        {
          # Minimal shell for opencode development only
          default = pkgs.mkShell {
            packages = with pkgs; [
              bun
              nodejs_20
              pkg-config
              openssl
              git
            ];
          };

          # Full Personas development environment with all stock dependencies
          # Usage: nix develop .#personas
          personas = pkgs.mkShell {
            name = "personas-dev";

            packages = with pkgs; [
              # Core development
              bun
              nodejs_20
              pkg-config
              openssl
              git

              # Stock dependencies (same as clients use)
              deps.wezterm
              deps.yazi
              deps.qdrant
              deps.ripgrep
              deps.fd
              deps.fzf
              deps.jq
              deps.gh

              # Python environment
              deps.pythonWithPackages
            ];

            shellHook = ''
              echo "╔══════════════════════════════════════════════════════════════╗"
              echo "║              🔺 Personas Development Environment 🔺            ║"
              echo "╠══════════════════════════════════════════════════════════════╣"
              echo "║  Stock dependencies loaded (same as client installations):  ║"
              echo "║  • wezterm   - Terminal emulator with pane orchestration    ║"
              echo "║  • yazi      - File manager                                  ║"
              echo "║  • qdrant    - Vector database for semantic memory          ║"
              echo "║  • ripgrep   - Fast code search                             ║"
              echo "╠══════════════════════════════════════════════════════════════╣"
              echo "║  Python packages (install via pip in venv):                 ║"
              echo "║  • pip install openbb           # Stanley: market data      ║"
              echo "║  • pip install nautilus-trader  # Stanley: backtesting      ║"
              echo "╚══════════════════════════════════════════════════════════════╝"

              # Create Python venv if it doesn't exist
              if [ ! -d ".venv" ]; then
                echo "Creating Python virtual environment..."
                python -m venv .venv
              fi

              # Activate venv
              source .venv/bin/activate

              # Set up qdrant data directory
              export QDRANT_DATA_DIR="''${QDRANT_DATA_DIR:-$HOME/.local/share/qdrant}"
              mkdir -p "$QDRANT_DATA_DIR"
            '';
          };

          # Minimal shell for CI/testing
          ci = pkgs.mkShell {
            packages = with pkgs; [
              bun
              nodejs_20
              git
              deps.ripgrep
            ];
          };
        }
      );

      # ========================================================================
      # Packages
      # ========================================================================
      packages = forEachSystem (
        system:
        let
          pkgs = pkgsFor system;
          deps = stockDeps system;
          mkNodeModules = pkgs.callPackage ./nix/node-modules.nix {
            hash = nodeModulesHash;
          };
          mkOpencode = pkgs.callPackage ./nix/opencode.nix { };
          mkDesktop = pkgs.callPackage ./nix/desktop.nix { };

          opencodePkg = mkOpencode {
            inherit (packageJson) version;
            src = ./.;
            scripts = ./nix/scripts;
            target = bunTarget.${system};
            modelsDev = "${modelsDev.${system}}/dist/_api.json";
            inherit mkNodeModules;
          };

          desktopPkg = mkDesktop {
            inherit (packageJson) version;
            src = ./.;
            scripts = ./nix/scripts;
            mkNodeModules = mkNodeModules;
            opencode = opencodePkg;
          };

          # Personas bundle: opencode + stock dependencies wrapped together
          # Usage: nix build .#personas
          personasPkg = pkgs.symlinkJoin {
            name = "agent-core-personas-${packageJson.version}";
            paths = [
              opencodePkg
              deps.wezterm
              deps.yazi
              deps.ripgrep
              deps.fd
              deps.fzf
              deps.jq
              deps.gh
            ];
            meta = {
              description = "Agent-Core Personas bundle with stock dependencies";
              longDescription = ''
                Complete Personas system bundle including:
                - opencode: The AI coding agent CLI
                - wezterm: Terminal emulator for pane orchestration
                - yazi: File manager
                - ripgrep, fd, fzf: Search utilities

                Note: Python packages (openbb, nautilus-trader) must be
                installed separately via pip as they're not in nixpkgs.

                Qdrant server must be run separately:
                  nix run .#qdrant
              '';
              license = lib.licenses.mit;
              platforms = [
                "aarch64-linux"
                "x86_64-linux"
                "aarch64-darwin"
                "x86_64-darwin"
              ];
            };
          };
        in
        {
          default = opencodePkg;
          opencode = opencodePkg;
          desktop = desktopPkg;
          personas = personasPkg;

          # Expose individual stock packages for flexibility
          qdrant = deps.qdrant;
          wezterm = deps.wezterm;
          yazi = deps.yazi;
        }
      );

      # ========================================================================
      # Apps (runnable via `nix run`)
      # ========================================================================
      apps = forEachSystem (
        system:
        let
          pkgs = pkgsFor system;
          deps = stockDeps system;
        in
        {
          # Development runner
          opencode-dev = {
            type = "app";
            meta = {
              description = "Nix devshell shell for OpenCode";
              runtimeInputs = [ pkgs.bun ];
            };
            program = "${
              pkgs.writeShellApplication {
                name = "opencode-dev";
                text = ''
                  exec bun run dev "$@"
                '';
              }
            }/bin/opencode-dev";
          };

          # Run Qdrant server (for Personas memory)
          # Usage: nix run .#qdrant
          qdrant = {
            type = "app";
            meta = {
              description = "Run Qdrant vector database server";
            };
            program = "${
              pkgs.writeShellApplication {
                name = "qdrant-server";
                runtimeInputs = [ deps.qdrant ];
                text = ''
                  QDRANT_DATA_DIR="''${QDRANT_DATA_DIR:-$HOME/.local/share/qdrant}"
                  mkdir -p "$QDRANT_DATA_DIR"
                  echo "Starting Qdrant on http://localhost:6333"
                  echo "Data directory: $QDRANT_DATA_DIR"
                  exec qdrant --storage-path "$QDRANT_DATA_DIR"
                '';
              }
            }/bin/qdrant-server";
          };

          # Quick setup script for Python packages
          # Usage: nix run .#setup-python
          setup-python = {
            type = "app";
            meta = {
              description = "Set up Python environment with OpenBB and NautilusTrader";
            };
            program = "${
              pkgs.writeShellApplication {
                name = "setup-python";
                runtimeInputs = [ deps.pythonWithPackages ];
                text = ''
                  echo "Setting up Python environment for Personas..."

                  # Create venv if needed
                  if [ ! -d ".venv" ]; then
                    echo "Creating virtual environment..."
                    python -m venv .venv
                  fi

                  source .venv/bin/activate

                  echo "Installing OpenBB Platform..."
                  pip install --upgrade openbb

                  echo "Installing NautilusTrader..."
                  pip install --upgrade nautilus-trader

                  echo ""
                  echo "✅ Python environment ready!"
                  echo "   Activate with: source .venv/bin/activate"
                '';
              }
            }/bin/setup-python";
          };
        }
      );

      # ========================================================================
      # NixOS/Home-Manager Module (optional integration)
      # ========================================================================
      nixosModules.default = { config, lib, pkgs, ... }: {
        options.services.agent-core = {
          enable = lib.mkEnableOption "Agent-Core Personas system";

          qdrant = {
            enable = lib.mkEnableOption "Qdrant vector database for Personas memory";
            dataDir = lib.mkOption {
              type = lib.types.path;
              default = "/var/lib/qdrant";
              description = "Data directory for Qdrant storage";
            };
          };
        };

        config = lib.mkIf config.services.agent-core.enable {
          environment.systemPackages = [
            self.packages.${pkgs.system}.personas
          ];

          # Qdrant service (if enabled)
          systemd.services.qdrant = lib.mkIf config.services.agent-core.qdrant.enable {
            description = "Qdrant Vector Database";
            wantedBy = [ "multi-user.target" ];
            after = [ "network.target" ];
            serviceConfig = {
              ExecStart = "${pkgs.qdrant}/bin/qdrant --storage-path ${config.services.agent-core.qdrant.dataDir}";
              Restart = "on-failure";
              DynamicUser = true;
              StateDirectory = "qdrant";
            };
          };
        };
      };
    };
}
