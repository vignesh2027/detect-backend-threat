"use client";
import { useRef, useEffect, useMemo, useCallback } from "react";
import * as THREE from "three";
import type { ThreatEvent } from "@/lib/types";
import { latLngToXYZ, geoForIP } from "@/lib/geo";
import { SEVERITY_COLOR } from "@/lib/types";

const GLOBE_RADIUS   = 2;
const ARC_SEGMENTS   = 32;   // points per arc curve
const MAX_ARCS       = 500;  // instanced mesh upper bound

interface Props {
  events:         ThreatEvent[];
  onSelectEvent:  (e: ThreatEvent) => void;
}

interface ArcState {
  event:    ThreatEvent;
  progress: number; // 0 → 1
  speed:    number;
  color:    THREE.Color;
  points:   THREE.Vector3[];
}

export default function Globe({ events, onSelectEvent }: Props) {
  const mountRef     = useRef<HTMLDivElement>(null);
  const rendererRef  = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef     = useRef<THREE.Scene | null>(null);
  const cameraRef    = useRef<THREE.PerspectiveCamera | null>(null);
  const arcsRef      = useRef<ArcState[]>([]);
  const particleMesh = useRef<THREE.InstancedMesh | null>(null);
  const rafRef       = useRef<number>(0);
  const isDragging   = useRef(false);
  const lastMouse    = useRef({ x: 0, y: 0 });
  const rotation     = useRef({ x: 0.3, y: 0 });

  // Convert an event into an arc spline
  const buildArc = useCallback((event: ThreatEvent): ArcState | null => {
    const srcGeo  = geoForIP(event.source_ip);
    const dstLat  = event.target_lat ?? 37.7749;
    const dstLng  = event.target_lng ?? -122.4194;

    const src = new THREE.Vector3(...latLngToXYZ(srcGeo.lat, srcGeo.lng, GLOBE_RADIUS));
    const dst = new THREE.Vector3(...latLngToXYZ(dstLat,    dstLng,    GLOBE_RADIUS));

    // Arc apex lifted above the surface proportional to distance
    const mid     = src.clone().add(dst).multiplyScalar(0.5);
    const dist    = src.distanceTo(dst);
    const apex    = mid.clone().normalize().multiplyScalar(GLOBE_RADIUS + dist * 0.4);

    const curve  = new THREE.QuadraticBezierCurve3(src, apex, dst);
    const points = curve.getPoints(ARC_SEGMENTS);
    const color  = new THREE.Color(SEVERITY_COLOR[event.severity]);

    return { event, progress: 0, speed: 0.008 + Math.random() * 0.006, color, points };
  }, []);

  // Sync new events → arcs (keep last MAX_ARCS)
  useEffect(() => {
    const newArcs = events
      .slice(0, MAX_ARCS)
      .map(buildArc)
      .filter((a): a is ArcState => a !== null);
    arcsRef.current = newArcs;
  }, [events, buildArc]);

  // Three.js setup (runs once)
  useEffect(() => {
    if (!mountRef.current) return;
    const el = mountRef.current;
    const W  = el.clientWidth;
    const H  = el.clientHeight;

    // Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(W, H);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    el.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Scene
    const scene = new THREE.Scene();
    sceneRef.current = scene;

    // Camera
    const camera = new THREE.PerspectiveCamera(45, W / H, 0.1, 100);
    camera.position.set(0, 0, 7);
    cameraRef.current = camera;

    // Ambient + directional light
    scene.add(new THREE.AmbientLight(0x334466, 0.8));
    const sun = new THREE.DirectionalLight(0xffffff, 1.2);
    sun.position.set(5, 3, 5);
    scene.add(sun);

    // Globe sphere — Earth texture (CC0 from NASA Blue Marble)
    const loader   = new THREE.TextureLoader();
    const earthTex = loader.load(
      "https://unpkg.com/three-globe@2.31.2/example/img/earth-night.jpg"
    );
    const globeGeo  = new THREE.SphereGeometry(GLOBE_RADIUS, 64, 64);
    const globeMat  = new THREE.MeshPhongMaterial({
      map:          earthTex,
      specular:     new THREE.Color(0x222244),
      shininess:    15,
    });
    scene.add(new THREE.Mesh(globeGeo, globeMat));

    // Atmosphere glow
    const atmGeo = new THREE.SphereGeometry(GLOBE_RADIUS * 1.025, 64, 64);
    const atmMat = new THREE.MeshPhongMaterial({
      color:       0x0044ff,
      transparent: true,
      opacity:     0.06,
      side:        THREE.FrontSide,
    });
    scene.add(new THREE.Mesh(atmGeo, atmMat));

    // Instanced mesh for arc particles
    const pGeo  = new THREE.SphereGeometry(0.012, 4, 4);
    const pMat  = new THREE.MeshBasicMaterial({ vertexColors: true });
    const iMesh = new THREE.InstancedMesh(pGeo, pMat, MAX_ARCS * ARC_SEGMENTS);
    iMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    scene.add(iMesh);
    particleMesh.current = iMesh;

    // Stars background
    const starVerts: number[] = [];
    for (let i = 0; i < 3000; i++) {
      const r = 80 + Math.random() * 20;
      const t = Math.random() * Math.PI * 2;
      const p = Math.acos(2 * Math.random() - 1);
      starVerts.push(
        r * Math.sin(p) * Math.cos(t),
        r * Math.cos(p),
        r * Math.sin(p) * Math.sin(t)
      );
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute("position", new THREE.Float32BufferAttribute(starVerts, 3));
    const starMat = new THREE.PointsMaterial({ color: 0xaaaacc, size: 0.15 });
    scene.add(new THREE.Points(starGeo, starMat));

    // Raycaster for arc click
    const raycaster  = new THREE.Raycaster();
    const mouse      = new THREE.Vector2();
    const dummy      = new THREE.Object3D();
    const colorArr   = new THREE.Color();

    function handleClick(e: MouseEvent) {
      const rect = renderer.domElement.getBoundingClientRect();
      mouse.set(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1
      );
      raycaster.setFromCamera(mouse, camera);
      const hits = raycaster.intersectObject(iMesh);
      if (hits.length > 0) {
        const arcIdx = Math.floor((hits[0].instanceId ?? 0) / ARC_SEGMENTS);
        const arc    = arcsRef.current[arcIdx];
        if (arc) onSelectEvent(arc.event);
      }
    }
    renderer.domElement.addEventListener("click", handleClick);

    // Mouse drag for globe rotation
    function onMouseDown(e: MouseEvent) {
      isDragging.current = true;
      lastMouse.current  = { x: e.clientX, y: e.clientY };
    }
    function onMouseMove(e: MouseEvent) {
      if (!isDragging.current) return;
      const dx = e.clientX - lastMouse.current.x;
      const dy = e.clientY - lastMouse.current.y;
      rotation.current.y += dx * 0.005;
      rotation.current.x += dy * 0.005;
      rotation.current.x = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, rotation.current.x));
      lastMouse.current  = { x: e.clientX, y: e.clientY };
    }
    function onMouseUp() { isDragging.current = false; }
    renderer.domElement.addEventListener("mousedown", onMouseDown);
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup",   onMouseUp);

    // Animation loop
    function animate() {
      rafRef.current = requestAnimationFrame(animate);
      if (!isDragging.current) rotation.current.y += 0.001;

      scene.rotation.x = rotation.current.x;
      scene.rotation.y = rotation.current.y;

      // Update instanced arc particles
      let instanceIdx = 0;
      const arcs = arcsRef.current;
      for (let a = 0; a < arcs.length; a++) {
        const arc  = arcs[a];
        arc.progress = Math.min(1, arc.progress + arc.speed);
        const head = Math.floor(arc.progress * (arc.points.length - 1));
        const tail = Math.max(0, head - 8);

        for (let p = tail; p <= head && instanceIdx < MAX_ARCS * ARC_SEGMENTS; p++) {
          const pt  = arc.points[p];
          const fade = (p - tail) / Math.max(1, head - tail);
          dummy.position.copy(pt);
          dummy.updateMatrix();
          iMesh.setMatrixAt(instanceIdx, dummy.matrix);
          colorArr.copy(arc.color).multiplyScalar(fade);
          iMesh.setColorAt(instanceIdx, colorArr);
          instanceIdx++;
        }
      }
      // Clear unused slots
      for (let i = instanceIdx; i < MAX_ARCS * ARC_SEGMENTS; i++) {
        dummy.position.set(9999, 9999, 9999);
        dummy.updateMatrix();
        iMesh.setMatrixAt(i, dummy.matrix);
      }
      iMesh.instanceMatrix.needsUpdate = true;
      if (iMesh.instanceColor) iMesh.instanceColor.needsUpdate = true;
      iMesh.count = instanceIdx;

      renderer.render(scene, camera);
    }
    animate();

    // Resize
    function onResize() {
      const W2 = el.clientWidth;
      const H2 = el.clientHeight;
      camera.aspect = W2 / H2;
      camera.updateProjectionMatrix();
      renderer.setSize(W2, H2);
    }
    window.addEventListener("resize", onResize);

    return () => {
      cancelAnimationFrame(rafRef.current);
      renderer.domElement.removeEventListener("click", handleClick);
      renderer.domElement.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup",   onMouseUp);
      window.removeEventListener("resize",    onResize);
      renderer.dispose();
      el.removeChild(renderer.domElement);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      ref={mountRef}
      style={{ width: "100%", height: "100%", cursor: "grab" }}
      aria-label="3D Attack Globe"
    />
  );
}
