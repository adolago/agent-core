/**
 * Claude Flow Browser Dashboard - Proof of Concept
 * WebSocket-based real-time swarm monitoring
 */

class ClaudeFlowDashboard {
  constructor() {
    this.ws = null;
    this.agents = new Map();
    this.tasks = new Map();
    this.consensus = {
      votesFor: 0,
      votesAgainst: 0,
      total: 20,
      threshold: 13,
    };

    this.initialize();
  }

  escapeHtml(text) {
    if (typeof text !== 'string') return String(text);
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  initialize() {
    this.setupCanvas();
    this.startSimulation();
    this.addLog('Dashboard initialized', 'info');

    // Auto-connect to local server
    setTimeout(() => {
      const wsUrl = `ws://${window.location.hostname}:${window.location.port || 8080}`;
      this.addLog(`Auto-connecting to ${wsUrl}...`, 'info');
      this.connectWebSocket(wsUrl);
    }, 1000);
  }

  /**
   * WebSocket Connection Management
   */
  connectWebSocket(url = 'ws://localhost:8080') {
    this.addLog(`Connecting to ${url}...`, 'info');

    try {
      this.ws = new WebSocket(url);

      this.ws.onopen = () => {
        this.updateConnectionStatus(true);
        this.addLog('Connected to Claude Flow MCP server', 'success');
        this.sendCommand('swarm_status');
      };

      this.ws.onmessage = (event) => {
        this.handleMessage(JSON.parse(event.data));
      };

      this.ws.onerror = (error) => {
        this.addLog(`WebSocket error: ${error.message}`, 'error');
        this.updateConnectionStatus(false);
      };

      this.ws.onclose = () => {
        this.addLog('Disconnected from server', 'warning');
        this.updateConnectionStatus(false);
      };
    } catch (error) {
      this.addLog(`Connection failed: ${error.message}`, 'error');
      this.updateConnectionStatus(false);
    }
  }

  sendCommand(command, params = {}) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(
        JSON.stringify({
          jsonrpc: '2.0',
          method: `mcp__claude-flow__${command}`,
          params,
          id: Date.now(),
        }),
      );
    } else {
      this.addLog('Not connected to server', 'warning');
    }
  }

  handleMessage(data) {
    switch (data.type) {
      case 'agent_update':
        this.updateAgent(data.agent);
        break;
      case 'consensus_update':
        this.updateConsensus(data.consensus);
        break;
      case 'task_update':
        this.updateTask(data.task);
        break;
      case 'swarm_status':
        this.updateSwarmStatus(data.status);
        break;
      default:
        console.log('Unknown message type:', data);
    }
  }

  /**
   * Agent Management
   */
  updateAgent(agent) {
    this.agents.set(agent.id, agent);
    this.renderAgents();
    this.updateStats();
    this.addLog(`Agent ${agent.name} is ${agent.status}`, 'info');
  }

  renderAgents() {
    const agentList = document.getElementById('agentList');

    // Handle empty state
    if (this.agents.size === 0) {
      if (!document.querySelector('.agent-empty-state')) {
        agentList.innerHTML = '';
        const emptyState = document.createElement('li');
        emptyState.className = 'agent-empty-state';
        emptyState.innerHTML = `
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                    <path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2zm0 18a8 8 0 1 1 8-8 8 8 0 0 1-8 8z"></path>
                    <path d="M12 12v6"></path>
                    <path d="M12 8h.01"></path>
                </svg>
                <p>No active agents connected</p>
                <span class="hint">Spawn agents to start the swarm</span>
            `;
        agentList.appendChild(emptyState);
      }
      return;
    }

    // Remove empty state if it exists
    const emptyState = document.querySelector('.agent-empty-state');
    if (emptyState) emptyState.remove();

    // Update or create agents
    this.agents.forEach((agent) => {
      const itemId = `agent-item-${agent.id}`;
      let li = document.getElementById(itemId);

      if (!li) {
        li = document.createElement('li');
        li.id = itemId;
        li.className = 'agent-item';
        li.innerHTML = `
                <div class="agent-info">
                    <div class="agent-name"></div>
                    <div class="agent-type"></div>
                </div>
                <div class="agent-status"></div>
            `;
        // Set static content securely
        li.querySelector('.agent-name').textContent = agent.name;
        li.querySelector('.agent-type').textContent = agent.type;
        agentList.appendChild(li);
      }

      // Update dynamic content efficiently
      const statusEl = li.querySelector('.agent-status');
      if (statusEl.textContent !== agent.status) {
        statusEl.className = `agent-status ${agent.status}`;
        statusEl.textContent = agent.status;
      }
    });

    // Remove agents that are no longer in the list
    const currentIds = new Set(Array.from(this.agents.keys()).map((id) => `agent-item-${id}`));
    Array.from(agentList.children).forEach((child) => {
      if (child.id && !currentIds.has(child.id)) {
        child.remove();
      }
    });
  }

  /**
   * Byzantine Consensus Tracking
   */
  updateConsensus(consensus) {
    this.consensus = { ...this.consensus, ...consensus };
    this.renderConsensus();

    const percentage = ((this.consensus.votesFor / this.consensus.total) * 100).toFixed(1);
    const reached = this.consensus.votesFor >= this.consensus.threshold;

    this.addLog(
      `Consensus: ${this.consensus.votesFor}/${this.consensus.total} votes (${percentage}%) - ${reached ? 'APPROVED' : 'PENDING'}`,
      reached ? 'success' : 'warning',
    );
  }

  renderConsensus() {
    const percentage = (this.consensus.votesFor / this.consensus.total) * 100;
    const fill = document.getElementById('consensusFill');
    const text = document.getElementById('consensusText');
    const margin = document.getElementById('securityMargin');
    const consensusPercentage = document.getElementById('consensusPercentage');
    const consensusBar = document.querySelector('.consensus-bar');

    fill.style.width = `${percentage}%`;
    text.textContent = `${this.consensus.votesFor}/${this.consensus.total}`;
    margin.textContent = `+${Math.max(0, this.consensus.votesFor - this.consensus.threshold)}`;
    consensusPercentage.textContent = `${percentage.toFixed(1)}%`;

    // Update ARIA attributes
    if (consensusBar) {
      consensusBar.setAttribute('aria-valuenow', this.consensus.votesFor);
      consensusBar.setAttribute('aria-valuemax', this.consensus.total);
      consensusBar.setAttribute(
        'aria-valuetext',
        `${this.consensus.votesFor} out of ${this.consensus.total} votes (${percentage.toFixed(1)}%)`,
      );
    }

    // Color coding
    if (this.consensus.votesFor >= this.consensus.threshold) {
      fill.style.background = 'linear-gradient(90deg, #00ff88, #00cc66)';
    } else {
      fill.style.background = 'linear-gradient(90deg, #ffa500, #ff8c00)';
    }
  }

  /**
   * Canvas Visualization
   */
  setupCanvas() {
    this.canvas = document.getElementById('swarmCanvas');
    this.ctx = this.canvas.getContext('2d');

    // Set canvas size
    const container = this.canvas.parentElement;
    this.canvas.width = container.clientWidth;
    this.canvas.height = container.clientHeight;

    // Responsive resize
    window.addEventListener('resize', () => {
      this.canvas.width = container.clientWidth;
      this.canvas.height = container.clientHeight;
    });
  }

  drawSwarmVisualization() {
    const ctx = this.ctx;
    const width = this.canvas.width;
    const height = this.canvas.height;

    // Clear canvas
    ctx.fillStyle = 'rgba(0, 0, 0, 0.05)';
    ctx.fillRect(0, 0, width, height);

    // Draw mesh topology connections
    const agents = Array.from(this.agents.values());
    const centerX = width / 2;
    const centerY = height / 2;
    const radius = Math.min(width, height) * 0.35;

    agents.forEach((agent, i) => {
      const angle = (i / agents.length) * Math.PI * 2;
      const x = centerX + Math.cos(angle) * radius;
      const y = centerY + Math.sin(angle) * radius;

      agent.x = x;
      agent.y = y;

      // Draw connections to other agents (mesh topology)
      agents.forEach((otherAgent, j) => {
        if (i < j) {
          ctx.strokeStyle = 'rgba(0, 255, 136, 0.1)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(agent.x, agent.y);
          ctx.lineTo(otherAgent.x, otherAgent.y);
          ctx.stroke();
        }
      });
    });

    // Draw agent nodes
    agents.forEach((agent) => {
      const color = agent.status === 'active' ? '#00ff88' : '#ffa500';

      // Glow effect
      ctx.shadowBlur = 15;
      ctx.shadowColor = color;

      // Node circle
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(agent.x, agent.y, 8, 0, Math.PI * 2);
      ctx.fill();

      // Reset shadow
      ctx.shadowBlur = 0;

      // Agent label
      ctx.fillStyle = '#ffffff';
      ctx.font = '10px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(agent.name, agent.x, agent.y + 20);
    });

    // Request next frame
    requestAnimationFrame(() => this.drawSwarmVisualization());
  }

  /**
   * Stats and UI Updates
   */
  updateStats() {
    document.getElementById('agentCount').textContent = this.agents.size;
    document.getElementById('taskCount').textContent = this.tasks.size;
  }

  updateConnectionStatus(connected) {
    const status = document.getElementById('connectionStatus');
    const label = document.getElementById('connectionLabel');

    status.className = `connection-status ${connected ? 'connected' : 'disconnected'}`;
    label.textContent = connected ? 'Connected' : 'Disconnected';
  }

  /**
   * Activity Logging
   */
  addLog(message, type = 'info') {
    const logContainer = document.getElementById('activityLog');
    const entry = document.createElement('div');
    entry.className = 'log-entry';

    const timestamp = new Date().toLocaleTimeString();
    const icon =
      {
        info: 'ℹ️',
        success: '✅',
        warning: '⚠️',
        error: '❌',
      }[type] || 'ℹ️';

    entry.innerHTML = `
            <span class="log-timestamp">${this.escapeHtml(timestamp)}</span>
            ${icon} ${this.escapeHtml(message)}
        `;

    logContainer.insertBefore(entry, logContainer.firstChild);

    // Keep only last 50 entries
    while (logContainer.children.length > 50) {
      logContainer.removeChild(logContainer.lastChild);
    }
  }

  /**
   * Simulation (for demo without backend)
   */
  startSimulation() {
    // Simulate some agents for demo
    const agentTypes = ['researcher', 'coder', 'reviewer', 'analyst', 'optimizer'];

    for (let i = 0; i < 5; i++) {
      const type = agentTypes[i % agentTypes.length];
      this.updateAgent({
        id: `agent-${i}`,
        name: `Agent-${i}`,
        type,
        status: i < 3 ? 'active' : 'idle',
      });
    }

    this.updateStats();
    this.drawSwarmVisualization();

    // Simulate periodic updates
    setInterval(() => {
      // Random agent status changes
      this.agents.forEach((agent) => {
        if (Math.random() > 0.95) {
          agent.status = agent.status === 'active' ? 'idle' : 'active';
          this.renderAgents();
        }
      });
    }, 2000);
  }
}

/**
 * Helper to manage button state
 */
function setLoading(button, isLoading) {
  if (!button || !button.classList.contains('btn')) return;

  button.disabled = isLoading;
  button.setAttribute('aria-busy', isLoading);

  const svg = button.querySelector('svg:not(.spinner)');
  let spinner = button.querySelector('.spinner');

  if (isLoading) {
    if (svg) svg.style.display = 'none';
    if (!spinner) {
      spinner = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      spinner.setAttribute('class', 'spinner');
      spinner.setAttribute('viewBox', '0 0 24 24');
      spinner.setAttribute('aria-hidden', 'true');
      // Simple loading arc
      spinner.innerHTML =
        '<path d="M21 12a9 9 0 1 1-6.219-8.56" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path>';

      if (svg) {
        button.insertBefore(spinner, svg);
      } else {
        button.prepend(spinner);
      }
    }
  } else {
    if (svg) svg.style.display = '';
    if (spinner) spinner.remove();
  }
}

/**
 * Quick Action Functions
 */
function spawnAgents(btn) {
  setLoading(btn, true);
  dashboard.addLog('Spawning 5 new agents...', 'info');
  dashboard.sendCommand('agents_spawn_parallel', {
    agents: [
      { type: 'researcher', name: 'Researcher-1', priority: 'high' },
      { type: 'coder', name: 'Coder-1', priority: 'medium' },
      { type: 'reviewer', name: 'Reviewer-1', priority: 'high' },
      { type: 'tester', name: 'Tester-1', priority: 'medium' },
      { type: 'analyst', name: 'Analyst-1', priority: 'low' },
    ],
    maxConcurrency: 5,
  });

  // Simulate agent creation for demo
  const agentTypes = ['researcher', 'coder', 'reviewer', 'tester', 'analyst'];
  agentTypes.forEach((type, i) => {
    setTimeout(() => {
      const id = `agent-${Date.now()}-${i}`;
      dashboard.updateAgent({
        id,
        name: `${type.charAt(0).toUpperCase() + type.slice(1)}-${i + 1}`,
        type,
        status: 'active',
      });
    }, i * 100);
  });

  // Reset button state
  setTimeout(() => setLoading(btn, false), agentTypes.length * 100 + 200);
}

function simulatePayment(btn) {
  setLoading(btn, true);
  dashboard.addLog('Initiating $50K vendor payment with Byzantine consensus...', 'info');

  // Simulate consensus votes coming in
  let votesFor = 0;
  const interval = setInterval(() => {
    votesFor += Math.floor(Math.random() * 3) + 1;
    if (votesFor > 20) votesFor = 20;

    dashboard.updateConsensus({
      votesFor,
      votesAgainst: 20 - votesFor,
      total: 20,
      threshold: 13,
    });

    if (votesFor >= 20) {
      clearInterval(interval);
      dashboard.addLog('Payment approved! 20/20 agents reached consensus in 1ms', 'success');
      setLoading(btn, false);
    }
  }, 200);
}

function testConsensus(btn) {
  dashboard.addLog('Testing Byzantine consensus with 20 agents...', 'info');
  simulatePayment(btn);
}

function resetConsensus(btn) {
  setLoading(btn, true);
  dashboard.consensus = {
    votesFor: 0,
    votesAgainst: 0,
    total: 20,
    threshold: 13,
  };
  dashboard.renderConsensus();
  dashboard.addLog('Consensus reset', 'info');
  setTimeout(() => setLoading(btn, false), 300);
}

function pauseQuery(btn) {
  setLoading(btn, true);
  dashboard.addLog('Pausing active query...', 'info');
  dashboard.sendCommand('query_control', {
    action: 'pause',
    queryId: 'query_123',
  });
  setTimeout(() => setLoading(btn, false), 500);
}

function connectWebSocket(btn) {
  const input = document.getElementById('wsUrl');
  const url = input ? input.value : 'ws://localhost:8080';

  if (url) {
    setLoading(btn, true);
    dashboard.connectWebSocket(url);
    // Reset after a timeout as we don't have async connect feedback wired here
    setTimeout(() => setLoading(btn, false), 2000);
  }
}

function clearLogs(btn) {
    const log = document.getElementById('activityLog');
    log.innerHTML = '';
    dashboard.addLog('Logs cleared', 'info');
}

async function copyLogs(btn) {
    if (btn.dataset.state === 'copied') return;

    const log = document.getElementById('activityLog');
    const text = log.innerText;

    try {
        await navigator.clipboard.writeText(text);

        // Store original state
        if (!btn.dataset.originalHtml) {
            btn.dataset.originalHtml = btn.innerHTML;
        }

        // Set success state
        btn.dataset.state = 'copied';
        btn.innerHTML = '✅';
        btn.setAttribute('aria-label', 'Logs copied');

        // Reset after delay
        setTimeout(() => {
            btn.innerHTML = btn.dataset.originalHtml;
            btn.setAttribute('aria-label', 'Copy logs to clipboard');
            btn.dataset.state = 'idle';
        }, 2000);

        dashboard.addLog('Logs copied to clipboard', 'success');
    } catch (err) {
        console.error('Failed to copy logs:', err);
        dashboard.addLog('Failed to copy logs', 'error');
    }
}

// Initialize dashboard
const dashboard = new ClaudeFlowDashboard();
