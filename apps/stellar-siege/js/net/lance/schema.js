export function createStellarLanceClasses(runtime) {
  const { GameObject, BaseTypes } = runtime;

  function normalizeCtorArgs(gameEngine, options, props) {
    const safeOptions = options ? { ...options } : {};
    const safeProps = props || {};

    if (!gameEngine) {
      if (safeOptions.id == null) safeOptions.id = -1;
      gameEngine = { world: { getNewId: () => -1 } };
    }

    return { gameEngine, options: safeOptions, props: safeProps };
  }

  class StellarNodeObject extends GameObject {
    netScheme() {
      return Object.assign({
        nodeId: { type: BaseTypes.Int16 },
        nodeType: { type: BaseTypes.String },
        ownerId: { type: BaseTypes.Int16 },
        energy: { type: BaseTypes.Float32 },
        maxEnergy: { type: BaseTypes.Float32 },
        productionRate: { type: BaseTypes.Float32 },
        defense: { type: BaseTypes.Float32 },
        radius: { type: BaseTypes.Float32 },
        x: { type: BaseTypes.Float32 },
        y: { type: BaseTypes.Float32 },
        upgrade: { type: BaseTypes.String },
        pulsePhase: { type: BaseTypes.Float32 },
        captureFlash: { type: BaseTypes.Float32 },
      }, super.netScheme());
    }

    constructor(gameEngine, options, props = {}) {
      const ctor = normalizeCtorArgs(gameEngine, options, props);
      super(ctor.gameEngine, ctor.options, { playerId: ctor.props.playerId ?? 0 });

      this.nodeId = ctor.props.nodeId ?? 0;
      this.nodeType = ctor.props.nodeType ?? 'planet';
      this.ownerId = ctor.props.ownerId ?? -1;
      this.energy = ctor.props.energy ?? 0;
      this.maxEnergy = ctor.props.maxEnergy ?? 0;
      this.productionRate = ctor.props.productionRate ?? 0;
      this.defense = ctor.props.defense ?? 1;
      this.radius = ctor.props.radius ?? 10;
      this.x = ctor.props.x ?? 0;
      this.y = ctor.props.y ?? 0;
      this.upgrade = ctor.props.upgrade ?? '';
      this.pulsePhase = ctor.props.pulsePhase ?? 0;
      this.captureFlash = ctor.props.captureFlash ?? 0;
    }
  }

  class StellarSwarmObject extends GameObject {
    netScheme() {
      return Object.assign({
        swarmId: { type: BaseTypes.Int16 },
        ownerId: { type: BaseTypes.Int16 },
        sourceNodeId: { type: BaseTypes.Int16 },
        targetNodeId: { type: BaseTypes.Int16 },
        moteCount: { type: BaseTypes.Int16 },
        centerX: { type: BaseTypes.Float32 },
        centerY: { type: BaseTypes.Float32 },
        targetX: { type: BaseTypes.Float32 },
        targetY: { type: BaseTypes.Float32 },
      }, super.netScheme());
    }

    constructor(gameEngine, options, props = {}) {
      const ctor = normalizeCtorArgs(gameEngine, options, props);
      super(ctor.gameEngine, ctor.options, { playerId: ctor.props.playerId ?? 0 });

      this.swarmId = ctor.props.swarmId ?? 0;
      this.ownerId = ctor.props.ownerId ?? -1;
      this.sourceNodeId = ctor.props.sourceNodeId ?? -1;
      this.targetNodeId = ctor.props.targetNodeId ?? -1;
      this.moteCount = ctor.props.moteCount ?? 0;
      this.centerX = ctor.props.centerX ?? 0;
      this.centerY = ctor.props.centerY ?? 0;
      this.targetX = ctor.props.targetX ?? 0;
      this.targetY = ctor.props.targetY ?? 0;
    }
  }

  return { StellarNodeObject, StellarSwarmObject };
}
