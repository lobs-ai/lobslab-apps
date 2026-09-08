import assert from 'node:assert/strict';
import WebSocket from 'ws';
const url = `ws://localhost:${process.env.PORT || 47101}`;
const sockets = [];
function client() {
  const socket = new WebSocket(url);
  sockets.push(socket);
  const messages = [];
  socket.on('message', data => messages.push(JSON.parse(data)));
  return { socket, messages, send: data => socket.send(JSON.stringify(data)),
    async wait(type, predicate = () => true) {
      const deadline=Date.now()+15000;
      while(Date.now()<deadline) {
        const found=messages.find(m=>m.type===type && predicate(m));
        if(found) return found;
        await new Promise(r=>setTimeout(r,25));
      }
      throw new Error(`Timed out waiting for ${type}`);
    }
  };
}
try {
  const host=client(), guest=client();
  await Promise.all(sockets.map(s=>new Promise((resolve,reject)=>{s.once('open',resolve);s.once('error',reject)})));
  host.send({type:'create',name:'Smoke host'});
  const joined=await host.wait('joined');
  guest.send({type:'join',code:joined.roomCode,name:'Smoke guest'});
  const guestJoined=await guest.wait('joined');
  assert.equal(guestJoined.roomCode,joined.roomCode);
  await host.wait('room',m=>m.players.length===2);
  host.send({type:'start'});
  const [a,b]=await Promise.all([host.wait('gameStart'),guest.wait('gameStart')]);
  assert.deepEqual(a.balls,b.balls);
  const ball=a.balls.find(b=>b.owner===0);
  host.send({type:'select',ballId:ball.id});
  host.send({type:'shoot',ballId:ball.id,angle:1.1,power:38,itemIndex:-1});
  const [ra,rb]=await Promise.all([host.wait('replay'),guest.wait('replay')]);
  assert.deepEqual(ra.snapshots,rb.snapshots);
  assert.ok(ra.snapshots.length>1);
  assert.ok(ra.snapshots.every(s=>s.balls.every(b=>Number.isFinite(b.x)&&Number.isFinite(b.y))));
  await host.wait('turn',m=>m.currentPlayer===1);
  console.log('Online passed: two clients join, start, share identical shot replays, and advance turns.');
} finally { for(const socket of sockets) socket.close(); }
