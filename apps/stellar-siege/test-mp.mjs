import WebSocket from 'ws';

const PORT = 3333;
const URL = `ws://localhost:${PORT}`;

function connect(name) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(URL);
    ws.on('open', () => resolve(ws));
    ws.on('error', reject);
    ws._name = name;
    ws._messages = [];
    ws.on('message', (raw) => {
      const msg = JSON.parse(raw);
      console.log(`[${name}] received:`, msg.type, JSON.stringify(msg).slice(0, 200));
      ws._messages.push(msg);
    });
  });
}

function send(ws, msg) {
  console.log(`[${ws._name}] sending:`, msg.type);
  ws.send(JSON.stringify(msg));
}

function waitForMessage(ws, type, timeout = 5000) {
  return new Promise((resolve, reject) => {
    // Check already received
    const existing = ws._messages.find(m => m.type === type);
    if (existing) {
      ws._messages = ws._messages.filter(m => m !== existing);
      return resolve(existing);
    }
    
    const timer = setTimeout(() => reject(new Error(`Timeout waiting for ${type} on ${ws._name}`)), timeout);
    const check = setInterval(() => {
      const msg = ws._messages.find(m => m.type === type);
      if (msg) {
        clearTimeout(timer);
        clearInterval(check);
        ws._messages = ws._messages.filter(m => m !== msg);
        resolve(msg);
      }
    }, 50);
  });
}

async function main() {
  console.log('=== Stellar Siege Multiplayer Test ===\n');

  // Connect two clients
  const host = await connect('HOST');
  const joiner = await connect('JOINER');
  console.log('Both clients connected\n');

  // Host creates lobby with 2 slots (host + 1 open)
  send(host, {
    type: 'create_lobby',
    config: {
      mapSize: 'small',
      slots: [
        { type: 'human' },  // host
        { type: 'open' },   // for joiner
      ],
    },
  });

  const lobbyCreated = await waitForMessage(host, 'lobby_created');
  const code = lobbyCreated.code;
  console.log(`\nLobby created with code: ${code}`);
  console.log('Lobby slots:', JSON.stringify(lobbyCreated.lobby.config.slots));
  console.log('');

  // Joiner joins
  send(joiner, { type: 'join_lobby', code, name: 'TestJoiner' });
  const joinedMsg = await waitForMessage(joiner, 'lobby_joined');
  console.log(`\nJoiner joined as playerId: ${joinedMsg.playerId}`);
  console.log('Lobby state:', JSON.stringify(joinedMsg.lobby));
  console.log('');

  // Wait for lobby update on host
  await waitForMessage(host, 'lobby_update');

  // Host starts game
  send(host, { type: 'start_game' });

  const hostStart = await waitForMessage(host, 'game_start');
  const joinerStart = await waitForMessage(joiner, 'game_start');

  console.log(`\nHost playerId: ${hostStart.playerId}`);
  console.log(`Joiner playerId: ${joinerStart.playerId}`);
  console.log(`\nPlayers in initial state:`, JSON.stringify(hostStart.initialState.players));
  console.log(`\nNodes (first 5):`, hostStart.initialState.nodes.slice(0, 5).map(n => ({
    id: n.id, type: n.type, owner: n.owner, energy: Math.round(n.energy),
    pos: `${Math.round(n.position.x)},${Math.round(n.position.y)}`
  })));

  // Find a node owned by the host (player 0) and a target node
  const hostNodes = hostStart.initialState.nodes.filter(n => n.owner === hostStart.playerId);
  const joinerNodes = joinerStart.initialState.nodes.filter(n => n.owner === joinerStart.playerId);
  const neutralNodes = hostStart.initialState.nodes.filter(n => n.owner === null);

  console.log(`\nHost owns ${hostNodes.length} nodes (owner=${hostStart.playerId})`);
  console.log(`Joiner owns ${joinerNodes.length} nodes (owner=${joinerStart.playerId})`);
  console.log(`Neutral nodes: ${neutralNodes.length}`);

  if (hostNodes.length === 0) {
    console.log('\n*** BUG: Host has no nodes! ***');
  }
  if (joinerNodes.length === 0) {
    console.log('\n*** BUG: Joiner has no nodes! ***');
  }

  // Host sends energy from one of their nodes to a target
  const source = hostNodes[0];
  const target = neutralNodes[0] || joinerNodes[0];
  if (source && target) {
    console.log(`\nHost sending energy from node ${source.id} (energy=${Math.round(source.energy)}) to node ${target.id}`);
    send(host, {
      type: 'action',
      action: {
        type: 'send_energy',
        sourceId: source.id,
        targetId: target.id,
        ratio: 0.5,
      },
    });

    // Wait for action broadcast on both
    try {
      const hostBroadcast = await waitForMessage(host, 'action_broadcast', 3000);
      console.log(`\nHost received action_broadcast:`, JSON.stringify(hostBroadcast.action));
    } catch (e) {
      console.log(`\n*** BUG: Host did NOT receive action_broadcast: ${e.message} ***`);
    }

    try {
      const joinerBroadcast = await waitForMessage(joiner, 'action_broadcast', 3000);
      console.log(`Joiner received action_broadcast:`, JSON.stringify(joinerBroadcast.action));
    } catch (e) {
      console.log(`\n*** BUG: Joiner did NOT receive action_broadcast: ${e.message} ***`);
    }
  }

  // Joiner sends energy too
  const jSource = joinerNodes[0];
  const jTarget = neutralNodes[1] || hostNodes[0];
  if (jSource && jTarget) {
    console.log(`\nJoiner sending energy from node ${jSource.id} (energy=${Math.round(jSource.energy)}) to node ${jTarget.id}`);
    send(joiner, {
      type: 'action',
      action: {
        type: 'send_energy',
        sourceId: jSource.id,
        targetId: jTarget.id,
        ratio: 0.5,
      },
    });

    try {
      const jBroadcast = await waitForMessage(joiner, 'action_broadcast', 3000);
      console.log(`\nJoiner action broadcast received:`, JSON.stringify(jBroadcast.action));
    } catch (e) {
      console.log(`\n*** BUG: Joiner action NOT broadcast: ${e.message} ***`);
    }
  }

  // Wait a bit for sync messages
  await new Promise(r => setTimeout(r, 2500));

  console.log('\n=== Test Complete ===');
  host.close();
  joiner.close();
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
