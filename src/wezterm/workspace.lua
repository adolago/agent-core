-- Agent-Core WezTerm Workspace
--
-- This creates the default agent-core workspace with:
-- - Main pane: Neovim with LSP connected to daemon
-- - Right pane: Daemon logs
-- - Bottom pane: Interactive shell for commands
--
-- Usage:
--   1. Add to your wezterm.lua: local agent_core = require("agent-core-workspace")
--   2. Call agent_core.setup_keybindings(config) in your config
--   3. Use LEADER + a for agent actions

local wezterm = require("wezterm")

local M = {}

-- Configuration
M.config = {
  agent_core_path = os.getenv("AGENT_CORE_PATH") or os.getenv("HOME") .. "/Repositories/tetraiad/agent-core",
  daemon_port = tonumber(os.getenv("AGENT_CORE_LSP_PORT")) or 7777,
  default_persona = os.getenv("AGENT_CORE_PERSONA") or "zee",
}

-- Spawn a new pane for a drone
function M.spawn_drone_pane(window, persona)
  local tab = window:active_tab()
  local pane = tab:active_pane()

  local drone_pane = pane:split({
    direction = "Right",
    size = 0.4,
    cwd = M.config.agent_core_path,
  })

  drone_pane:send_text(string.format("agent-core --agent %s\n", persona))
  return drone_pane
end

-- Create the agent-core workspace layout
function M.create_workspace()
  local mux = wezterm.mux

  local tab, main_pane, window = mux.spawn_window({
    workspace = "agent-core",
    cwd = M.config.agent_core_path,
  })

  tab:set_title("agent-core")

  -- Split right for daemon logs (30% width)
  local logs_pane = main_pane:split({
    direction = "Right",
    size = 0.3,
    cwd = M.config.agent_core_path,
  })

  -- Start daemon in logs pane
  logs_pane:send_text("npx tsx .claude/skills/personas/scripts/personas-daemon.ts start 2>&1 | tee /tmp/agent-core-daemon.log\n")

  -- Split bottom for interactive shell (20% height)
  local _shell_pane = main_pane:split({
    direction = "Bottom",
    size = 0.2,
    cwd = M.config.agent_core_path,
  })

  -- Wait for daemon to start, then launch nvim with LSP
  wezterm.sleep_ms(2000)

  main_pane:send_text(string.format([[
while ! nc -z localhost %d 2>/dev/null; do
  echo "Waiting for agent-core daemon..."
  sleep 1
done
echo "Daemon ready! Starting Neovim..."
nvim -c "lua vim.defer_fn(function() require('agent-core.lsp.nvim-config').setup_tcp(%d) end, 500)"
]], M.config.daemon_port, M.config.daemon_port))

  main_pane:activate()
  return window
end

-- Key bindings for agent-core actions
function M.setup_keybindings(config_builder)
  local act = wezterm.action

  config_builder.keys = config_builder.keys or {}

  -- LEADER + a -> Agent actions menu
  table.insert(config_builder.keys, {
    key = "a",
    mods = "LEADER",
    action = act.InputSelector({
      title = "Agent-Core Actions",
      choices = {
        { label = "Spawn Zee drone", id = "spawn_zee" },
        { label = "Spawn Stanley drone", id = "spawn_stanley" },
        { label = "Spawn Johny drone", id = "spawn_johny" },
        { label = "Show daemon status", id = "status" },
        { label = "Restart daemon", id = "restart" },
        { label = "Stop daemon", id = "stop" },
      },
      action = wezterm.action_callback(function(window, pane, id, _label)
        if id == "spawn_zee" then
          M.spawn_drone_pane(window, "zee")
        elseif id == "spawn_stanley" then
          M.spawn_drone_pane(window, "stanley")
        elseif id == "spawn_johny" then
          M.spawn_drone_pane(window, "johny")
        elseif id == "status" then
          pane:send_text("npx tsx .claude/skills/personas/scripts/personas-daemon.ts status\n")
        elseif id == "restart" then
          pane:send_text("npx tsx .claude/skills/personas/scripts/personas-daemon.ts restart\n")
        elseif id == "stop" then
          pane:send_text("npx tsx .claude/skills/personas/scripts/personas-daemon.ts stop\n")
        end
      end),
    }),
  })

  -- LEADER + d -> Toggle daemon logs pane
  table.insert(config_builder.keys, {
    key = "d",
    mods = "LEADER",
    action = act.ActivatePaneByIndex(1),
  })

  -- LEADER + n -> Focus Neovim pane
  table.insert(config_builder.keys, {
    key = "n",
    mods = "LEADER",
    action = act.ActivatePaneByIndex(0),
  })

  -- LEADER + s -> Spawn drone pane selector
  table.insert(config_builder.keys, {
    key = "s",
    mods = "LEADER",
    action = act.InputSelector({
      title = "Spawn Drone",
      choices = {
        { label = "Zee (Personal Assistant)", id = "zee" },
        { label = "Stanley (Investment)", id = "stanley" },
        { label = "Johny (Learning)", id = "johny" },
      },
      action = wezterm.action_callback(function(window, _pane, id, _label)
        if id then
          M.spawn_drone_pane(window, id)
        end
      end),
    }),
  })

  -- LEADER + c -> Canvas actions menu
  table.insert(config_builder.keys, {
    key = "c",
    mods = "LEADER",
    action = act.InputSelector({
      title = "Canvas Actions",
      choices = {
        { label = "Show Calendar", id = "calendar" },
        { label = "Show Notes", id = "text" },
        { label = "Show Document", id = "document" },
        { label = "Show Table", id = "table" },
        { label = "List Canvases", id = "list" },
        { label = "Close All Canvases", id = "close_all" },
      },
      action = wezterm.action_callback(function(_window, pane, id, _label)
        if id == "list" then
          pane:send_text("echo '{\"id\":\"1\",\"method\":\"canvas:list\",\"params\":{}}' | nc -U ~/.zee/agent-core/daemon.sock\n")
        elseif id == "close_all" then
          pane:send_text("# Closing all canvases via daemon IPC\n")
        elseif id then
          -- Spawn canvas of selected type
          local cmd = string.format(
            "echo '{\"id\":\"1\",\"method\":\"canvas:spawn\",\"params\":{\"kind\":\"%s\",\"id\":\"%s-1\"}}' | nc -U ~/.zee/agent-core/daemon.sock\n",
            id, id
          )
          pane:send_text(cmd)
        end
      end),
    }),
  })

  return config_builder
end

return M
