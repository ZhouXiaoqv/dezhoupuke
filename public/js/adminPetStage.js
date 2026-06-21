import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import * as SkeletonUtils from "three/addons/utils/SkeletonUtils.js";

const PET_ANIMATION_NAMES = [
  "static",
  "idle",
  "walk",
  "run",
  "eat",
  "dance",
  "gesture-positive",
  "gesture-negative",
];

class AdminPetStage {
  constructor() {
    this.host = null;
    this.empty = null;
    this.select = null;
    this.actions = null;
    this.renderer = null;
    this.scene = null;
    this.camera = null;
    this.loader = null;
    this.clock = new THREE.Clock();
    this.pets = [];
    this.petId = "";
    this.assets = new Map();
    this.model = null;
    this.mixer = null;
    this.actionsByName = new Map();
    this.currentAction = null;
    this.rafId = 0;
    this.resizeObserver = null;
    this.dragging = false;
    this.dragStartX = 0;
    this.rotationStart = 0;
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
    this.host = document.getElementById("adminPetStage");
    this.empty = document.getElementById("adminPetStageEmpty");
    this.select = document.getElementById("adminPetSelect");
    this.actions = document.getElementById("adminPetActions");
    if (!this.host || !this.select || !this.actions) return false;
    if (this.renderer) return true;

    this.scene = new THREE.Scene();
    this.camera = new THREE.OrthographicCamera(-2, 2, 2, -2, -100, 100);
    this.camera.position.set(0, 0, 8);
    this.camera.lookAt(0, 0, 0);
    this.loader = new GLTFLoader();
    this.renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.host.appendChild(this.renderer.domElement);

    const ambient = new THREE.HemisphereLight(0xffffff, 0x1a231d, 2.6);
    this.scene.add(ambient);
    const key = new THREE.DirectionalLight(0xffffff, 2.4);
    key.position.set(2.2, 3.2, 3.5);
    this.scene.add(key);
    const fill = new THREE.DirectionalLight(0x9fd7ff, 1.1);
    fill.position.set(-2.8, 1.4, 2);
    this.scene.add(fill);

    this.bindEvents();
    this.renderActionButtons();
    this.resize();
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(this.host);
    this.start();
    return true;
  }

  bindEvents() {
    this.select.addEventListener("change", () => {
      this.loadById(this.select.value);
    });
    this.host.addEventListener("pointerdown", (event) => {
      if (!this.model) return;
      this.dragging = true;
      this.dragStartX = event.clientX;
      this.rotationStart = this.model.rotation.y;
      this.host.setPointerCapture(event.pointerId);
    });
    this.host.addEventListener("pointermove", (event) => {
      if (!this.dragging || !this.model) return;
      const rect = this.host.getBoundingClientRect();
      const delta = (event.clientX - this.dragStartX) / Math.max(1, rect.width);
      this.model.rotation.y = this.rotationStart + delta * Math.PI * 2;
    });
    const stopDrag = (event) => {
      this.dragging = false;
      if (this.host.hasPointerCapture(event.pointerId)) {
        this.host.releasePointerCapture(event.pointerId);
      }
    };
    this.host.addEventListener("pointerup", stopDrag);
    this.host.addEventListener("pointercancel", stopDrag);
  }

  renderActionButtons() {
    this.actions.innerHTML = "";
    PET_ANIMATION_NAMES.forEach((name) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "admin-pet-action-btn";
      btn.textContent = name;
      btn.dataset.anim = name;
      btn.addEventListener("click", () => this.play(name));
      this.actions.appendChild(btn);
    });
    this.updateActionButtons("");
  }

  sync(pets = []) {
    if (!this.ensure()) return;
    this.pets = pets.filter((pet) => pet?.id && pet.modelUrl);
    this.renderPetOptions();
    if (!this.pets.length) {
      this.clearModel();
      return;
    }
    const nextId = this.pets.some((pet) => pet.id === this.petId)
      ? this.petId
      : this.pets[0].id;
    if (nextId !== this.petId || !this.model) this.loadById(nextId);
  }

  renderPetOptions() {
    const current = this.select.value;
    this.select.innerHTML = "";
    this.pets.forEach((pet) => {
      const option = document.createElement("option");
      option.value = pet.id;
      option.textContent = pet.name || pet.id;
      this.select.appendChild(option);
    });
    if (this.pets.some((pet) => pet.id === current)) this.select.value = current;
  }

  async loadById(id) {
    const pet = this.pets.find((item) => item.id === id);
    if (!pet) return;
    this.petId = pet.id;
    this.select.value = pet.id;
    this.empty?.classList.add("hidden");
    const gltf = await this.loadAsset(pet);
    if (this.petId !== pet.id || !gltf) return;
    this.setModel(gltf);
  }

  async loadAsset(pet) {
    if (this.assets.has(pet.id)) return this.assets.get(pet.id);
    const promise = new Promise((resolve) => {
      this.loader.load(
        pet.modelUrl,
        (gltf) => resolve(gltf),
        undefined,
        () => resolve(null),
      );
    });
    this.assets.set(pet.id, promise);
    return promise;
  }

  setModel(gltf) {
    this.clearModel();
    this.model = SkeletonUtils.clone(gltf.scene);
    this.model.traverse((node) => {
      if (node.isMesh) node.frustumCulled = false;
    });
    this.fitModel();
    this.scene.add(this.model);
    this.mixer = new THREE.AnimationMixer(this.model);
    this.actionsByName = new Map(
      (gltf.animations || []).map((clip) => [clip.name, this.mixer.clipAction(clip)]),
    );
    this.updateActionButtons("");
    this.play("idle");
  }

  fitModel() {
    this.model.position.set(0, 0, 0);
    this.model.rotation.set(0, Math.PI, 0);
    this.model.scale.setScalar(1);
    this.model.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(this.model);
    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    box.getSize(size);
    box.getCenter(center);
    const stageRect = this.host?.getBoundingClientRect();
    const aspect = stageRect ? Math.max(0.5, stageRect.width / Math.max(1, stageRect.height)) : 1;
    const viewHeight = 3.25;
    const viewWidth = viewHeight * aspect;
    const scale = Math.min(
      (viewWidth * 0.72) / Math.max(size.x, size.z, 1),
      (viewHeight * 0.82) / Math.max(size.y, 1),
    );
    this.model.scale.setScalar(scale);
    this.model.position.set(-center.x * scale, -center.y * scale, -center.z * scale);
    this.model.updateMatrixWorld(true);
  }

  play(name) {
    const action = this.actionsByName.get(name);
    if (!action) return;
    action.reset();
    action.enabled = true;
    action.setLoop(THREE.LoopRepeat, Infinity);
    action.clampWhenFinished = false;
    if (this.currentAction && this.currentAction !== action) {
      action.crossFadeFrom(this.currentAction, 0.12, false);
    }
    action.play();
    this.currentAction = action;
    this.updateActionButtons(name);
  }

  updateActionButtons(activeName) {
    this.actions?.querySelectorAll(".admin-pet-action-btn").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.anim === activeName);
      btn.disabled = !this.actionsByName.has(btn.dataset.anim);
    });
  }

  clearModel() {
    if (this.model) this.scene?.remove(this.model);
    this.model = null;
    this.mixer = null;
    this.actionsByName.clear();
    this.currentAction = null;
    this.empty?.classList.remove("hidden");
  }

  resize() {
    if (!this.renderer || !this.camera || !this.host) return;
    const rect = this.host.getBoundingClientRect();
    const width = Math.max(1, Math.floor(rect.width));
    const height = Math.max(1, Math.floor(rect.height));
    this.renderer.setSize(width, height, false);
    const aspect = width / height;
    const viewHeight = 3.25;
    this.camera.left = -viewHeight * aspect / 2;
    this.camera.right = viewHeight * aspect / 2;
    this.camera.top = viewHeight / 2;
    this.camera.bottom = -viewHeight / 2;
    this.camera.updateProjectionMatrix();
    if (this.model) this.fitModel();
  }

  start() {
    if (this.rafId) return;
    const tick = () => {
      this.rafId = requestAnimationFrame(tick);
      if (document.getElementById("adminScreen")?.classList.contains("active")) {
        this.mixer?.update(this.clock.getDelta());
        this.renderer?.render(this.scene, this.camera);
      } else {
        this.clock.getDelta();
      }
    };
    tick();
  }
}

const adminPetStage = new AdminPetStage();
window.AdminPetStage = {
  sync: (pets) => adminPetStage.sync(pets),
};
if (window.adminCatalog?.pets) {
  window.AdminPetStage.sync(window.adminCatalog.pets);
}
