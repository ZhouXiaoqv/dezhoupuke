import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import * as SkeletonUtils from "three/addons/utils/SkeletonUtils.js";

const PET_ANIMS = {
  idle: "idle",
  active: "gesture-positive",
  fold: "gesture-negative",
  celebrate: "dance",
};

const PET_SLOT_ANCHORS = {
  0: "top",
  1: "left",
  2: "top",
  3: "left",
  4: "top",
  5: "right",
  6: "left",
  7: "right",
};

const PET_HANG_ROTATION = Math.PI / 5;
const PET_HANG_INWARD_ROTATION = Math.PI / 18;
const PET_HANG_OVERLAP_RATIO = 0.35;
const PET_HANG_CORE_OVERLAP_RATIO = 0.27;
const PET_HANG_VERTICAL_RATIO = 0.68;

const PET_ACTION_ANIMS = {
  fold: PET_ANIMS.fold,
  raise: PET_ANIMS.celebrate,
  allin: PET_ANIMS.celebrate,
  allinCall: PET_ANIMS.celebrate,
  allinRaise: PET_ANIMS.celebrate,
};

class PetStage3D {
  constructor() {
    this.table = null;
    this.stage = null;
    this.renderer = null;
    this.scene = null;
    this.camera = null;
    this.loader = null;
    this.clock = new THREE.Clock();
    this.assets = new Map();
    this.instances = new Map();
    this.lastState = null;
    this.lastActivePlayerId = "";
    this.lastLayoutSignature = "";
    this.layoutFrame = 0;
    this.resizeObserver = null;
    this.resizeHandler = () => this.scheduleLayoutCheck();
    this.rafId = 0;
    this.enabled = this.canUseWebGL();
  }

  canUseWebGL() {
    try {
      const canvas = document.createElement("canvas");
      return !!(canvas.getContext("webgl2") || canvas.getContext("webgl"));
    } catch {
      return false;
    }
  }

  ensure() {
    if (!this.enabled) return false;
    const table = document.getElementById("table");
    if (!table) return false;
    if (this.table === table && this.renderer) return true;

    this.disconnectLayoutObservers();
    this.table = table;
    const tableContainer = document.getElementById("table-container");
    const stageHost = tableContainer || table;
    this.stage = stageHost.querySelector(":scope > .pet-stage");
    if (!this.stage) {
      this.stage = document.createElement("div");
      this.stage.className = "pet-stage";
      stageHost.insertBefore(this.stage, stageHost.firstChild);
    }

    this.scene = new THREE.Scene();
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, -100, 100);
    this.camera.position.set(0, 0, 10);
    this.camera.lookAt(0, 0, 0);
    this.renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.stage.innerHTML = "";
    this.stage.appendChild(this.renderer.domElement);
    this.loader = new GLTFLoader();

    const ambient = new THREE.HemisphereLight(0xffffff, 0x243324, 2.5);
    this.scene.add(ambient);
    const key = new THREE.DirectionalLight(0xffffff, 2.2);
    key.position.set(0.5, 1.2, 1);
    this.scene.add(key);

    this.resize();
    this.observeLayout();
    this.start();
    return true;
  }

  observeLayout() {
    this.lastLayoutSignature = this.getLayoutSignature();
    if (typeof ResizeObserver !== "undefined") {
      this.resizeObserver = new ResizeObserver(() => this.scheduleLayoutCheck());
      if (this.table) this.resizeObserver.observe(this.table);
      if (this.stage) this.resizeObserver.observe(this.stage);
    }
    window.addEventListener("resize", this.resizeHandler, { passive: true });
    window.visualViewport?.addEventListener("resize", this.resizeHandler, { passive: true });
  }

  disconnectLayoutObservers() {
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }
    window.removeEventListener("resize", this.resizeHandler);
    window.visualViewport?.removeEventListener("resize", this.resizeHandler);
    if (this.layoutFrame) {
      cancelAnimationFrame(this.layoutFrame);
      this.layoutFrame = 0;
    }
  }

  getLayoutSignature() {
    if (!this.table || !this.stage) return "";
    const tableRect = this.table.getBoundingClientRect();
    const stageRect = this.stage.getBoundingClientRect();
    const key = (rect) =>
      [rect.left, rect.top, rect.width, rect.height]
        .map((value) => Math.round(value * 2) / 2)
        .join(":");
    return `${key(tableRect)}|${key(stageRect)}`;
  }

  scheduleLayoutCheck() {
    if (this.layoutFrame) return;
    this.layoutFrame = requestAnimationFrame(() => {
      this.layoutFrame = 0;
      this.handleLayoutChanged();
    });
  }

  handleLayoutChanged() {
    if (!this.renderer || !this.stage) return;
    const signature = this.getLayoutSignature();
    if (signature && signature === this.lastLayoutSignature) return;
    this.lastLayoutSignature = signature;
    this.resize();
    this.repositionCurrentState();
  }

  resize() {
    if (!this.renderer || !this.stage || !this.camera) return;
    const rect = this.stage.getBoundingClientRect();
    const width = Math.max(1, Math.floor(rect.width));
    const height = Math.max(1, Math.floor(rect.height));
    this.renderer.setSize(width, height, false);
    this.camera.left = -width / 2;
    this.camera.right = width / 2;
    this.camera.top = height / 2;
    this.camera.bottom = -height / 2;
    this.camera.updateProjectionMatrix();
  }

  start() {
    if (this.rafId) return;
    const tick = () => {
      this.rafId = requestAnimationFrame(tick);
      if (!this.renderer || !this.scene || !this.camera) return;
      const dt = this.clock.getDelta();
      for (const instance of this.instances.values()) {
        instance.mixer?.update(dt);
      }
      this.renderer.render(this.scene, this.camera);
    };
    tick();
  }

  getPetDef(petId) {
    if (!petId || !window.PET_CATALOG) return null;
    return window.PET_CATALOG.find((pet) => pet.id === petId) || null;
  }

  async loadPet(petId) {
    if (this.assets.has(petId)) return this.assets.get(petId);
    const def = this.getPetDef(petId);
    if (!def) return null;
    const promise = new Promise((resolve) => {
      this.loader.load(
        def.modelUrl,
        (gltf) => resolve(gltf),
        undefined,
        () => resolve(null),
      );
    });
    this.assets.set(petId, promise);
    return promise;
  }

  cloneScene(source) {
    const clone = SkeletonUtils.clone(source);
    clone.traverse((node) => {
      if (node.isMesh) node.frustumCulled = false;
    });
    return clone;
  }

  async ensureInstance(player) {
    const petId = player.pet || player.publicProfile?.pet || "";
    const key = String(player.id);
    const existing = this.instances.get(key);
    if (existing?.petId === petId) return existing;
    if (existing) this.removeInstance(key);
    if (!petId) return null;

    const gltf = await this.loadPet(petId);
    if (!gltf || !this.scene) return null;
    const model = this.cloneScene(gltf.scene);
    model.scale.setScalar(38);
    model.rotation.x = 0;
    model.userData.playerId = key;

    const mixer = new THREE.AnimationMixer(model);
    const clips = new Map((gltf.animations || []).map((clip) => [clip.name, clip]));
    const instance = {
      petId,
      model,
      mixer,
      clips,
      action: null,
      returnTimer: 0,
    };
    this.scene.add(model);
    this.instances.set(key, instance);
    this.play(instance, PET_ANIMS.idle, true);
    return instance;
  }

  removeInstance(key) {
    const instance = this.instances.get(key);
    if (!instance) return;
    if (instance.returnTimer) clearTimeout(instance.returnTimer);
    this.scene?.remove(instance.model);
    this.instances.delete(key);
  }

  play(instance, name, loop = false) {
    const clip = instance.clips.get(name) || instance.clips.get(PET_ANIMS.idle);
    if (!clip) return;
    const next = instance.mixer.clipAction(clip);
    next.reset();
    next.enabled = true;
    next.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, loop ? Infinity : 1);
    next.clampWhenFinished = !loop;
    if (instance.action && instance.action !== next) {
      next.crossFadeFrom(instance.action, 0.08, false);
    }
    next.play();
    instance.action = next;
    if (!loop) {
      if (instance.returnTimer) clearTimeout(instance.returnTimer);
      instance.returnTimer = setTimeout(() => {
        this.play(instance, PET_ANIMS.idle, true);
      }, Math.max(300, clip.duration * 1000));
    }
  }

  getSeatSlot(seat) {
    const match = [...seat.classList]
      .find((name) => name.startsWith("seat-pos-"))
      ?.match(/^seat-pos-(\d+)$/);
    return match ? Number(match[1]) : 0;
  }

  getSeatBounds(seat) {
    const seatRect = seat.getBoundingClientRect();
    const infoRect = seat.querySelector(".seat-info")?.getBoundingClientRect();
    const cardsRect = seat.querySelector(".seat-cards, .my-hand")?.getBoundingClientRect();
    const coreRects = [infoRect, cardsRect].filter(Boolean);
    const coreRect = coreRects.length
      ? {
          left: Math.min(...coreRects.map((rect) => rect.left)),
          right: Math.max(...coreRects.map((rect) => rect.right)),
          top: Math.min(...coreRects.map((rect) => rect.top)),
          bottom: Math.max(...coreRects.map((rect) => rect.bottom)),
        }
      : seatRect;
    coreRect.width = coreRect.right - coreRect.left;
    coreRect.height = coreRect.bottom - coreRect.top;
    return { seatRect, infoRect, cardsRect, coreRect };
  }

  getPetConstraints(bounds, slot, isMobile) {
    const anchor = PET_SLOT_ANCHORS[slot] || "top";
    const { seatRect, infoRect, cardsRect, coreRect } = bounds;
    if (anchor === "left" || anchor === "right") {
      const topEdge = infoRect?.top ?? seatRect.top;
      const bottomEdge = cardsRect?.bottom ?? seatRect.bottom;
      const hangCenterY = topEdge + (bottomEdge - topEdge) * PET_HANG_VERTICAL_RATIO;
      const isLeft = anchor === "left";
      return {
        type: anchor,
        edgeX: isLeft ? coreRect.left : coreRect.right,
        coreWidth: coreRect.width,
        footY: Math.max(topEdge, bottomEdge),
        hangCenterY,
        topY: topEdge,
        rotationY: isLeft ? PET_HANG_INWARD_ROTATION : -PET_HANG_INWARD_ROTATION,
        rotationZ: isLeft ? PET_HANG_ROTATION : -PET_HANG_ROTATION,
      };
    }
    const topRect = infoRect || coreRect;
    const topEdge = topRect.top;
    return {
      type: "top",
      centerX: topRect.left + topRect.width / 2,
      footY: topEdge,
      rotationY: 0,
      rotationZ: 0,
    };
  }

  getModelBounds(instance, scale, rotationZ, rotationY = 0) {
    const model = instance.model;
    model.position.set(0, 0, 0);
    model.rotation.y = rotationY;
    model.rotation.z = rotationZ;
    model.scale.setScalar(scale);
    model.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(model);
    if (!Number.isFinite(box.min.x)) {
      return { minX: -scale / 2, maxX: scale / 2, minY: 0, maxY: scale };
    }
    return {
      minX: box.min.x,
      maxX: box.max.x,
      minY: box.min.y,
      maxY: box.max.y,
    };
  }

  getConstrainedScale(instance, constraints, isMobile) {
    const baseScale = isMobile ? 22 : 34;
    if (constraints.type === "top" || !constraints.topY) return baseScale;
    const unitBounds = this.getModelBounds(
      instance,
      1,
      constraints.rotationZ,
      constraints.rotationY,
    );
    const unitHeight = Math.max(1, unitBounds.maxY - unitBounds.minY);
    const availableHeight = Math.max(1, constraints.footY - constraints.topY);
    const fittedScale = availableHeight / unitHeight;
    return Math.max(isMobile ? 16 : 24, Math.min(baseScale, fittedScale));
  }

  positionInstance(player, index) {
    const key = String(player.id);
    const instance = this.instances.get(key);
    if (!instance || !this.table) return;
    const seat = this.table.querySelector(`.seat-${index}`);
    if (!seat) return;
    const stageRect = this.stage.getBoundingClientRect();
    const slot = this.getSeatSlot(seat);
    const isMobile = window.innerWidth <= 700;
    const centerX = stageRect.width / 2;
    const centerY = stageRect.height / 2;
    const constraints = this.getPetConstraints(this.getSeatBounds(seat), slot, isMobile);
    const scale = this.getConstrainedScale(instance, constraints, isMobile);
    const bounds = this.getModelBounds(
      instance,
      scale,
      constraints.rotationZ,
      constraints.rotationY,
    );
    const anchorY = constraints.hangCenterY ?? constraints.footY;
    const footWorldY = centerY - (anchorY - stageRect.top);
    let x = 0;
    if (constraints.type === "left") {
      const edgeWorldX = constraints.edgeX - stageRect.left - centerX;
      const modelWidth = Math.max(1, bounds.maxX - bounds.minX);
      const overlapX = Math.min(
        modelWidth * PET_HANG_OVERLAP_RATIO,
        Math.max(1, constraints.coreWidth) * PET_HANG_CORE_OVERLAP_RATIO,
      );
      x = edgeWorldX + overlapX - bounds.maxX;
    } else if (constraints.type === "right") {
      const edgeWorldX = constraints.edgeX - stageRect.left - centerX;
      const modelWidth = Math.max(1, bounds.maxX - bounds.minX);
      const overlapX = Math.min(
        modelWidth * PET_HANG_OVERLAP_RATIO,
        Math.max(1, constraints.coreWidth) * PET_HANG_CORE_OVERLAP_RATIO,
      );
      x = edgeWorldX - overlapX - bounds.minX;
    } else {
      const centerWorldX = constraints.centerX - stageRect.left - centerX;
      x = centerWorldX - (bounds.minX + bounds.maxX) / 2;
    }
    const y = constraints.hangCenterY
      ? footWorldY - (bounds.minY + bounds.maxY) / 2
      : footWorldY - bounds.minY;

    instance.model.position.set(x, y, 0);
    instance.model.rotation.y = constraints.rotationY;
    instance.model.rotation.z = constraints.rotationZ;
    instance.model.scale.setScalar(scale);
  }

  repositionCurrentState() {
    if (!this.lastState?.players?.length || !this.table || !this.stage) return;
    for (let index = 0; index < this.lastState.players.length; index += 1) {
      this.positionInstance(this.lastState.players[index], index);
    }
  }

  playForPlayer(playerId, animationName) {
    const instance = this.instances.get(String(playerId));
    if (!instance || !animationName) return;
    this.play(instance, animationName, false);
  }

  handleAction(entry) {
    if (!entry?.playerId) return;
    const animationName = PET_ACTION_ANIMS[entry.action];
    if (animationName) this.playForPlayer(entry.playerId, animationName);
  }

  celebrateWinners(winners = []) {
    for (const winner of winners) {
      if (winner?.id) this.playForPlayer(winner.id, PET_ANIMS.celebrate);
    }
  }

  resetEvents() {
    this.lastActivePlayerId = "";
  }

  async sync(state) {
    if (!state?.players?.length) {
      this.lastState = null;
      this.clear();
      return;
    }
    this.lastState = state;
    if (!this.ensure()) return;
    this.resize();
    const live = new Set();
    for (let index = 0; index < state.players.length; index += 1) {
      const player = state.players[index];
      const key = String(player.id);
      live.add(key);
      const instance = await this.ensureInstance(player);
      if (!instance) continue;
      this.positionInstance(player, index);
      const isActive =
        state.currentIdx === index &&
        state.phase !== "showdown" &&
        state.phase !== "idle";
      if (isActive && this.lastActivePlayerId !== key) {
        this.lastActivePlayerId = key;
        this.play(instance, PET_ANIMS.active, false);
      } else if (!isActive && this.lastActivePlayerId === key) {
        this.lastActivePlayerId = "";
      }
    }
    for (const key of [...this.instances.keys()]) {
      if (!live.has(key)) this.removeInstance(key);
    }
    this.lastLayoutSignature = this.getLayoutSignature();
  }

  clear() {
    for (const key of [...this.instances.keys()]) this.removeInstance(key);
    this.lastActivePlayerId = "";
  }
}

const manager = new PetStage3D();
window.Pets3D = {
  sync: (state) => manager.sync(state),
  handleAction: (entry) => manager.handleAction(entry),
  celebrateWinners: (winners) => manager.celebrateWinners(winners),
  resetEvents: () => manager.resetEvents(),
  clear: () => manager.clear(),
};
