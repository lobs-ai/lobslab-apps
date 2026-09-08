(async () => {
  const { GameManager } = await import('/js/game/GameManager.js');
  const { simulateStep, allBallsStopped } = await import('/js/physics/PhysicsEngine.js');
  const { PLAYER_COLORS } = await import('/js/constants.js');
  const assert = (condition, message) => { if (!condition) throw new Error(message); };
  document.getElementById('menuBtn').click();
  const game = new GameManager(document.getElementById('c'));
  const results = [];
  let seed = 90210;
  const random = Math.random;
  Math.random = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  try {
    for (const playerCount of [2,3,4]) {
      game.resize();
      game.start(Array.from({length:playerCount}, (_,i) => ({name:`Test ${i}`,color:PLAYER_COLORS[i],isAI:false})));
      cancelAnimationFrame(game._raf);
      assert(game.balls.every(b => game.arena.contains(b.x-b.radius,b.y-b.radius) && game.arena.contains(b.x+b.radius,b.y+b.radius)), 'Spawn outside table');
      assert(game.balls.every((b,i) => game.balls.slice(i+1).every(o => Math.hypot(b.x-o.x,b.y-o.y) >= b.radius+o.radius)), 'Overlapping spawns');
      let turns = 0;
      while(game.phase !== 'gameover' && turns < 220) {
        const player = game.players[game.currentPlayer];
        const shot = game.ai.computeShot(player,game.balls,game.arena);
        assert(shot && Number.isFinite(shot.power), 'Invalid AI shot');
        game._selectBall(shot.ball);
        game.activeItemIndex = shot.itemIndex >= 0 ? shot.itemIndex : null;
        game._shoot(shot.angle,shot.power);
        assert(game.phase==='simulate','Shot did not begin simulation');
        let frames=0;
        do {
          game.storm.update(1/60);
          game._processEvents(simulateStep(game.balls,game.arena,game.storm.currentRadius,1/60));
          assert(game.balls.every(b => Number.isFinite(b.x) && Number.isFinite(b.y)), 'Nonfinite ball position');
          frames++;
        } while(!allBallsStopped(game.balls) && frames<480);
        game._endTurn();
        turns++;
      }
      assert(game.phase === 'gameover', `Match stalled after ${turns} turns`);
      assert(game.players.filter(p=>!p.isEliminated(game.balls)).length <= 1, 'Multiple winners');
      results.push({players:playerCount,turns,round:game.round,storm:game.storm.percent});
      document.getElementById('playAgainBtn').click();
      cancelAnimationFrame(game._raf);
      assert(game.phase === 'select' && game.round === 1, 'Rematch did not reset the game');
      assert(game.players.every(p => p.stats.shotsFired === 0), 'Rematch retained old stats');
    }
    game.start([{name:'You',color:PLAYER_COLORS[0],isAI:false},{name:'Bot',color:PLAYER_COLORS[1],isAI:true}]);
    cancelAnimationFrame(game._raf);
    const ball=game.balls[0];
    game.input._onDown(ball.x,ball.y);
    game.input._onMove(ball.x-100,ball.y);
    assert(game.input.aiming && game.input.getAimInfo().power>40,'One-gesture aiming failed');
    game.input._onUp();
    assert(game.phase==='simulate','One-gesture shooting failed');
    game._endTurn();
    assert(game.input._phase==='wait','Human input enabled during bot turn');
    game.destroy();
    assert(game.input.events.signal.aborted,'Input listeners leaked after exit');
    return JSON.stringify({matches:results,controls:'passed',cleanup:'passed'});
  } finally {
    Math.random = random;
    game.destroy();
  }
})()
