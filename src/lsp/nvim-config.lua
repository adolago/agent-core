-- Agent-Core LSP Configuration for Neovim
--
-- Add this to your Neovim config to enable agent-core LSP integration.
-- This provides:
--   - Diagnostics showing drone/task status
--   - Code actions for spawning drones
--   - Hover info showing agent state
--
-- Usage:
--   1. Copy this file or source it: require('path/to/nvim-config')
--   2. Start the LSP server: bun run /path/to/agent-core/src/lsp/server.ts
--   3. Open any file - the LSP will connect automatically

local M = {}

-- LSP server configuration
M.server_config = {
  name = "agent_core",
  cmd = { "bun", "run", vim.fn.expand("~/Repositories/agent-core/src/lsp/server.ts") },
  -- Alternative: use node
  -- cmd = { "node", vim.fn.expand("~/Repositories/agent-core/dist/lsp/server.js") },
  filetypes = { "*" }, -- Attach to all file types
  root_dir = function(fname)
    return vim.fn.getcwd()
  end,
  settings = {},
  init_options = {},
}

-- Set up the LSP client
function M.setup()
  local lspconfig = require("lspconfig")
  local configs = require("lspconfig.configs")

  -- Register the agent-core LSP if not already registered
  if not configs.agent_core then
    configs.agent_core = {
      default_config = M.server_config,
    }
  end

  -- Configure the LSP
  lspconfig.agent_core.setup({
    on_attach = function(client, bufnr)
      -- Enable diagnostics
      vim.diagnostic.config({
        virtual_text = {
          prefix = "●",
          source = "if_many",
        },
        signs = true,
        underline = false,
        update_in_insert = false,
        severity_sort = true,
      })

      -- Key mappings for agent actions
      local opts = { noremap = true, silent = true, buffer = bufnr }

      -- Show agent state on hover (line 0)
      vim.keymap.set("n", "<leader>as", function()
        vim.lsp.buf.hover()
      end, vim.tbl_extend("force", opts, { desc = "Agent state" }))

      -- Code actions (spawn drone, etc.)
      vim.keymap.set("n", "<leader>aa", function()
        vim.lsp.buf.code_action()
      end, vim.tbl_extend("force", opts, { desc = "Agent actions" }))

      -- Custom commands
      vim.api.nvim_buf_create_user_command(bufnr, "AgentSpawnZee", function()
        vim.lsp.buf.execute_command({
          command = "agent.spawnDrone",
          arguments = { { persona = "zee", task = "Custom task", prompt = "Help me with this" } },
        })
      end, { desc = "Spawn Zee drone" })

      vim.api.nvim_buf_create_user_command(bufnr, "AgentSpawnStanley", function()
        vim.lsp.buf.execute_command({
          command = "agent.spawnDrone",
          arguments = { { persona = "stanley", task = "Analysis task", prompt = "Analyze this" } },
        })
      end, { desc = "Spawn Stanley drone" })

      vim.api.nvim_buf_create_user_command(bufnr, "AgentSpawnJohny", function()
        vim.lsp.buf.execute_command({
          command = "agent.spawnDrone",
          arguments = { { persona = "johny", task = "Learning task", prompt = "Explain this" } },
        })
      end, { desc = "Spawn Johny drone" })

      vim.api.nvim_buf_create_user_command(bufnr, "AgentSearchMemory", function(cmd_opts)
        local query = cmd_opts.args
        if query == "" then
          query = vim.fn.expand("<cword>")
        end
        vim.lsp.buf.execute_command({
          command = "agent.searchMemory",
          arguments = { { query = query, limit = 10 } },
        })
      end, { nargs = "?", desc = "Search agent memory" })

      print("Agent-Core LSP attached to buffer " .. bufnr)
    end,

    capabilities = vim.lsp.protocol.make_client_capabilities(),
  })
end

-- Diagnostic signs
function M.setup_signs()
  local signs = {
    { name = "DiagnosticSignError", text = "✗" },
    { name = "DiagnosticSignWarn", text = "!" },
    { name = "DiagnosticSignHint", text = "⚡" },
    { name = "DiagnosticSignInfo", text = "ℹ" },
  }

  for _, sign in ipairs(signs) do
    vim.fn.sign_define(sign.name, { texthl = sign.name, text = sign.text, numhl = "" })
  end
end

-- Auto-setup when this module is required
function M.auto_setup()
  M.setup_signs()

  -- Defer setup to ensure lspconfig is loaded
  vim.defer_fn(function()
    local ok, _ = pcall(require, "lspconfig")
    if ok then
      M.setup()
    else
      vim.notify("lspconfig not found - agent-core LSP not configured", vim.log.levels.WARN)
    end
  end, 100)
end

-- TCP connection setup (for daemon mode)
-- Use this when agent-core daemon is running as a background service
function M.setup_tcp(port)
  port = port or 7777

  M.setup_signs()

  -- Start LSP client with TCP connection
  vim.lsp.start({
    name = "agent-core",
    cmd = vim.lsp.rpc.connect("127.0.0.1", port),
    root_dir = vim.fn.getcwd(),
    on_attach = function(client, bufnr)
      -- Enable diagnostics
      vim.diagnostic.config({
        virtual_text = { prefix = "●", source = "if_many" },
        signs = true,
        underline = false,
        update_in_insert = false,
        severity_sort = true,
      })

      -- Key mappings
      local opts = { noremap = true, silent = true, buffer = bufnr }
      vim.keymap.set("n", "<leader>as", vim.lsp.buf.hover, vim.tbl_extend("force", opts, { desc = "Agent state" }))
      vim.keymap.set("n", "<leader>aa", vim.lsp.buf.code_action, vim.tbl_extend("force", opts, { desc = "Agent actions" }))

      -- Commands
      vim.api.nvim_buf_create_user_command(bufnr, "AgentSpawnZee", function()
        vim.lsp.buf.execute_command({ command = "agent.spawnDrone", arguments = { { persona = "zee" } } })
      end, { desc = "Spawn Zee drone" })

      vim.api.nvim_buf_create_user_command(bufnr, "AgentSpawnStanley", function()
        vim.lsp.buf.execute_command({ command = "agent.spawnDrone", arguments = { { persona = "stanley" } } })
      end, { desc = "Spawn Stanley drone" })

      vim.api.nvim_buf_create_user_command(bufnr, "AgentSpawnJohny", function()
        vim.lsp.buf.execute_command({ command = "agent.spawnDrone", arguments = { { persona = "johny" } } })
      end, { desc = "Spawn Johny drone" })

      vim.notify("Agent-Core LSP connected via TCP:" .. port, vim.log.levels.INFO)
    end,
  })
end

return M
