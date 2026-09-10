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
        pairId: { type: BaseTypes.Int16 },
        pairColor: { type: BaseTypes.String },
        ownerId: { type: BaseTypes.Int16 },
        energy: { type: BaseTypes.Float32 },
        maxEnergy: { type: BaseTypes.Float32 },
        productionRate: { type: BaseTypes.Float32 },
        defense: { type: BaseTypes.Float32 },
        radius: { type: BaseTypes.Float32 },
        x: { type: BaseTypes.Float32 },
        y: { type: BaseTypes.Float32 },
        upgrade: { type: BaseTypes.String },
      }, super.netScheme());
    }

    // Lance 5's string pruning drops changed strings and assumes classId is set.
    // Send complete strings; they carry node ownership visuals and mote snapshots.
    prunedStringsClone() { return this; }

    // Lance requires syncTo on the immediate prototype (hasOwnProperty check in addNewObject)
    syncTo(other) { super.syncTo(other); }

    constructor(gameEngine, options, props = {}) {
      const ctor = normalizeCtorArgs(gameEngine, options, props);
      super(ctor.gameEngine, ctor.options, { playerId: ctor.props.playerId ?? 0 });

      this.nodeId = ctor.props.nodeId ?? 0;
      this.nodeType = ctor.props.nodeType ?? 'planet';
      this.pairId = ctor.props.pairId ?? -1;
      this.pairColor = ctor.props.pairColor ?? '';
      this.ownerId = ctor.props.ownerId ?? -1;
      this.energy = ctor.props.energy ?? 0;
      this.maxEnergy = ctor.props.maxEnergy ?? 0;
      this.productionRate = ctor.props.productionRate ?? 0;
      this.defense = ctor.props.defense ?? 1;
      this.radius = ctor.props.radius ?? 10;
      this.x = ctor.props.x ?? 0;
      this.y = ctor.props.y ?? 0;
      this.upgrade = ctor.props.upgrade ?? '';
    }
  }

  class StellarSwarmObject extends GameObject {
    netScheme() {
      return Object.assign({
        swarmId: { type: BaseTypes.Int32 },
        ownerId: { type: BaseTypes.Int16 },
        sourceNodeId: { type: BaseTypes.Int16 },
        targetNodeId: { type: BaseTypes.Int16 },
        moteCount: { type: BaseTypes.Int16 },
        sampleTick: { type: BaseTypes.Int32 },
        commandId: { type: BaseTypes.Int32 },
        moteData: { type: BaseTypes.String },
        centerX: { type: BaseTypes.Float32 },
        centerY: { type: BaseTypes.Float32 },
        targetX: { type: BaseTypes.Float32 },
        targetY: { type: BaseTypes.Float32 },
      }, super.netScheme());
    }

    // Lance 5's string pruning drops changed strings and assumes classId is set.
    // Send complete strings; they carry node ownership visuals and mote snapshots.
    prunedStringsClone() { return this; }

    // Lance requires syncTo on the immediate prototype (hasOwnProperty check in addNewObject)
    syncTo(other) { super.syncTo(other); }

    constructor(gameEngine, options, props = {}) {
      const ctor = normalizeCtorArgs(gameEngine, options, props);
      super(ctor.gameEngine, ctor.options, { playerId: ctor.props.playerId ?? 0 });

      this.swarmId = ctor.props.swarmId ?? 0;
      this.ownerId = ctor.props.ownerId ?? -1;
      this.sourceNodeId = ctor.props.sourceNodeId ?? -1;
      this.targetNodeId = ctor.props.targetNodeId ?? -1;
      this.moteCount = ctor.props.moteCount ?? 0;
      this.sampleTick = ctor.props.sampleTick ?? 0;
      this.commandId = ctor.props.commandId ?? 0;
      this.moteData = ctor.props.moteData ?? '';
      this.centerX = ctor.props.centerX ?? 0;
      this.centerY = ctor.props.centerY ?? 0;
      this.targetX = ctor.props.targetX ?? 0;
      this.targetY = ctor.props.targetY ?? 0;
    }
  }

  return { StellarNodeObject, StellarSwarmObject };
}
