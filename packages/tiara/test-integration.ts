/**
 * Integration test: Tiara HiveMind with Agent-Core daemon
 *
 * Tests:
 * 1. HiveMind initialization with process registration
 * 2. Agent spawning with agent-core registration
 * 3. Memory operations via AgentCoreClient
 */

import { HiveMind } from './src/hive-mind/core/HiveMind.js';
import { getAgentCoreClient, resetAgentCoreClient } from './src/hive-mind/integration/AgentCoreClient.js';

// Reset client to enable debug mode
resetAgentCoreClient();

async function testIntegration() {
  console.log('=== Tiara + Agent-Core Integration Test ===\n');

  // 1. Check agent-core daemon is accessible
  console.log('1. Checking agent-core daemon...');
  const client = getAgentCoreClient();

  try {
    const processes = await client.listProcesses();
    console.log(`   ✓ Agent-core daemon accessible, ${processes.length} processes registered\n`);
  } catch (err) {
    console.log(`   ✗ Agent-core daemon not accessible: ${err}`);
    process.exit(1);
  }

  // 2. Initialize HiveMind
  console.log('2. Initializing HiveMind...');
  const hiveMind = new HiveMind({
    name: 'integration-test-swarm',
    topology: 'mesh',
    queenMode: 'centralized',
    maxAgents: 4,
    consensusThreshold: 0.66,
    memoryTTL: 3600,
  });

  try {
    await hiveMind.initialize();
    const status = await hiveMind.getFullStatus();
    console.log(`   ✓ HiveMind initialized: ${status.swarmId}`);
    console.log(`   ✓ Agents: ${status.agents?.length || 0}, Tasks: ${status.tasks?.length || 0}\n`);
  } catch (err) {
    console.log(`   ✗ HiveMind init failed: ${err}`);
    await hiveMind.shutdown();
    process.exit(1);
  }

  // 3. Check process registration
  console.log('3. Checking process registration...');
  try {
    const processes = await client.listProcesses();
    const swarmProcess = processes.find(p => p.type === 'swarm');
    if (swarmProcess) {
      console.log(`   ✓ Swarm registered: ${swarmProcess.id} (${swarmProcess.status})\n`);
    } else {
      console.log('   ! Swarm not found in process registry\n');
    }
  } catch (err) {
    console.log(`   ! Process check failed: ${err}\n`);
  }

  // 4. Spawn an agent
  console.log('4. Spawning test agent...');
  try {
    const agent = await hiveMind.spawnAgent({
      name: 'TestAgent',
      type: 'researcher',
      capabilities: ['analysis', 'research'],
    });
    console.log(`   ✓ Agent spawned: ${agent.id}`);
    console.log(`   ✓ Type: ${agent.type}, Status: ${agent.status}\n`);

    // Check if agent is in process registry
    const processes = await client.listProcesses();
    const agentProcess = processes.find(p => p.id === agent.id);
    if (agentProcess) {
      console.log(`   ✓ Agent registered in process registry\n`);
    } else {
      console.log('   ! Agent not found in process registry\n');
    }
  } catch (err) {
    console.log(`   ✗ Agent spawn failed: ${err}\n`);
  }

  // 5. Test memory via AgentCoreClient
  console.log('5. Testing memory via AgentCoreClient...');
  try {
    await client.storeMemory({
      category: 'decision',
      content: 'Integration test: Tiara HiveMind successfully connected to agent-core',
      metadata: {
        importance: 0.8,
        tags: ['test', 'integration', 'tiara'],
      },
    });
    console.log('   ✓ Memory stored via AgentCoreClient');

    const results = await client.searchMemory({
      query: 'Tiara integration test',
      limit: 3,
    });
    console.log(`   ✓ Memory search returned ${results.length} results\n`);
  } catch (err) {
    console.log(`   ✗ Memory operation failed: ${err}\n`);
  }

  // 6. Cleanup
  console.log('6. Shutting down...');
  try {
    await hiveMind.shutdown();
    console.log('   ✓ HiveMind shutdown complete\n');
  } catch (err) {
    console.log(`   ! Shutdown issue: ${err}\n`);
  }

  // Final check - process should be deregistered
  console.log('7. Verifying cleanup...');
  try {
    const processes = await client.listProcesses();
    console.log(`   Remaining processes: ${processes.length}`);
    processes.forEach(p => console.log(`   - ${p.type}: ${p.id} (${p.status})`));
  } catch (err) {
    console.log(`   ! Cleanup check failed: ${err}`);
  }

  console.log('\n=== Integration test complete ===');
}

testIntegration().catch(console.error);
