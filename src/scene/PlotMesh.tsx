import { useRef, useState } from 'react';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';
import { getPlotDerivedInfo } from '../game/rules';
import type { PlotId, PlotState } from '../game/types';
import type { SharedFarmTextures } from './materials';

interface PlotMeshProps {
  plot: PlotState;
  position: [number, number, number];
  isSelected: boolean;
  isSoftwareGl: boolean;
  textures: SharedFarmTextures;
  nowMs: number;
  onPlotInteract: (plotId: PlotId) => void;
}

const CROP_SPOTS: Array<[number, number]> = [
  [-0.65, -0.45],
  [0, -0.45],
  [0.65, -0.45],
  [-0.65, 0.45],
  [0, 0.45],
  [0.65, 0.45],
];

export function PlotMesh({
  plot,
  position,
  isSelected,
  isSoftwareGl,
  textures,
  nowMs,
  onPlotInteract,
}: PlotMeshProps) {
  const [hovered, setHovered] = useState(false);
  const pointerDownPos = useRef<{ x: number; y: number } | null>(null);
  const cropGroupRef = useRef<THREE.Group>(null);
  const beaconRef = useRef<THREE.Group>(null);

  const derived = getPlotDerivedInfo(plot, nowMs);
  const isWatered = derived.status === 'growing' || derived.status === 'ready';

  useFrame((state) => {
    const t = state.clock.getElapsedTime();
    if (cropGroupRef.current && (derived.status === 'growing' || derived.status === 'ready')) {
      const sway = Math.sin(t * 2.2 + position[0]) * 0.035;
      cropGroupRef.current.rotation.z = sway;
    }
    if (beaconRef.current) {
      beaconRef.current.position.y = 1.45 + Math.sin(t * 3.4 + position[0]) * 0.1;
      beaconRef.current.rotation.y = t * 1.4;
    }
  });

  const handlePointerDown = (e: ThreeEvent<PointerEvent>) => {
    pointerDownPos.current = { x: e.clientX, y: e.clientY };
  };

  const handlePointerUp = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    if (!pointerDownPos.current) return;
    const dx = e.clientX - pointerDownPos.current.x;
    const dy = e.clientY - pointerDownPos.current.y;
    pointerDownPos.current = null;
    // Ignore camera orbit/pan drags (> 6px pointer travel)
    if (Math.hypot(dx, dy) <= 6) {
      onPlotInteract(plot.id);
    }
  };

  const frameColor = isSelected ? '#f59e0b' : hovered ? '#fbbf24' : '#855836';
  const growthScale =
    derived.status === 'growing'
      ? 0.25 + derived.progress * 0.72
      : derived.status === 'ready'
        ? 1.05
        : 1;

  return (
    <group position={position}>
      {/* Wooden raised plot border */}
      <mesh
        position={[0, 0.09, 0]}
        receiveShadow={!isSoftwareGl}
        castShadow={!isSoftwareGl}
        onPointerOver={(e) => {
          e.stopPropagation();
          setHovered(true);
          document.body.style.cursor = 'pointer';
        }}
        onPointerOut={() => {
          setHovered(false);
          document.body.style.cursor = 'default';
        }}
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
      >
        <boxGeometry args={[2.55, 0.18, 2.05]} />
        <meshStandardMaterial color={frameColor} roughness={0.8} metalness={0.05} />
      </mesh>

      {/* Soil Bed (dry vs watered dark moist soil) */}
      <mesh
        position={[0, 0.15, 0]}
        receiveShadow={!isSoftwareGl}
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
      >
        <boxGeometry args={[2.28, 0.1, 1.78]} />
        <meshStandardMaterial
          color="#ffffff"
          map={isWatered ? textures.soilWetColor : textures.soilDryColor}
          bumpMap={textures.bumpNoise}
          bumpScale={0.04}
          roughness={isWatered ? 0.58 : 0.94}
          metalness={0.0}
        />
      </mesh>

      {/* Selection outline glow strip */}
      {(isSelected || hovered) && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, 0]}>
          <ringGeometry args={[1.45, 1.58, 4]} />
          <meshBasicMaterial
            color={isSelected ? '#f59e0b' : '#fde68a'}
            transparent
            opacity={0.75}
          />
        </mesh>
      )}

      {/* STATE 1: Planted & Waiting for Water */}
      {derived.status === 'planted_unwatered' && (
        <group>
          {CROP_SPOTS.map(([cx, cz], idx) => (
            <group key={idx} position={[cx, 0.21, cz]}>
              {/* Small soil mound */}
              <mesh>
                <sphereGeometry args={[0.14, 8, 6, 0, Math.PI * 2, 0, Math.PI * 0.5]} />
                <meshStandardMaterial color="#7b502e" roughness={0.95} />
              </mesh>
              {/* Visible seed kernel */}
              <mesh position={[0, 0.08, 0]}>
                <sphereGeometry args={[0.055, 6, 6]} />
                <meshStandardMaterial
                  color={derived.cropId === 'wheat' ? '#e5c158' : '#e07a35'}
                  roughness={0.6}
                />
              </mesh>
            </group>
          ))}

          {/* Floating Water Drop Cue */}
          <group ref={beaconRef} position={[0, 1.35, 0]}>
            <mesh position={[0, -0.05, 0]}>
              <sphereGeometry args={[0.19, 10, 10]} />
              <meshStandardMaterial
                color="#38bdf8"
                emissive="#0284c7"
                emissiveIntensity={0.35}
                roughness={0.2}
                metalness={0.1}
              />
            </mesh>
            <mesh position={[0, 0.14, 0]}>
              <coneGeometry args={[0.16, 0.26, 10]} />
              <meshStandardMaterial
                color="#38bdf8"
                emissive="#0284c7"
                emissiveIntensity={0.35}
                roughness={0.2}
              />
            </mesh>
          </group>
        </group>
      )}

      {/* STATE 2 & 3: Growing or Ready — Distinct Wheat vs Carrot Geometry */}
      {(derived.status === 'growing' || derived.status === 'ready') && (
        <group ref={cropGroupRef} position={[0, 0.2, 0]} scale={[1, growthScale, 1]}>
          {derived.cropId === 'wheat' &&
            CROP_SPOTS.map(([cx, cz], idx) => (
              <group key={idx} position={[cx, 0, cz]}>
                {/* 3 clustered wheat stalks per spot */}
                {[
                  [-0.08, -0.04, 0.08],
                  [0.08, 0.02, -0.07],
                  [0, 0.07, 0.04],
                ].map(([sx, sz, tilt], j) => (
                  <group key={j} position={[sx, 0, sz]} rotation={[tilt, j * 1.1, -tilt]}>
                    {/* Stalk */}
                    <mesh position={[0, 0.42, 0]} castShadow={!isSoftwareGl}>
                      <cylinderGeometry args={[0.022, 0.032, 0.84, 5]} />
                      <meshStandardMaterial
                        color={derived.status === 'ready' ? '#d9a426' : '#65a30d'}
                        roughness={0.75}
                      />
                    </mesh>
                    {/* Golden Grain Ear (enlarged when ready) */}
                    {derived.progress > 0.45 && (
                      <mesh position={[0, 0.86, 0]} castShadow={!isSoftwareGl}>
                        <capsuleGeometry args={[0.055, 0.24, 4, 6]} />
                        <meshStandardMaterial
                          color={derived.status === 'ready' ? '#facc15' : '#a3b92c'}
                          emissive={derived.status === 'ready' ? '#a16207' : '#000000'}
                          emissiveIntensity={derived.status === 'ready' ? 0.2 : 0}
                          roughness={0.55}
                        />
                      </mesh>
                    )}
                  </group>
                ))}
              </group>
            ))}

          {derived.cropId === 'carrot' &&
            CROP_SPOTS.map(([cx, cz], idx) => (
              <group key={idx} position={[cx, 0, cz]}>
                {/* Plump Orange Carrot Shoulder peeking from soil when >= 40% */}
                {derived.progress > 0.35 && (
                  <mesh position={[0, 0.06, 0]} rotation={[Math.PI, 0, 0]} castShadow={!isSoftwareGl}>
                    <coneGeometry args={[0.13, 0.28, 8]} />
                    <meshStandardMaterial
                      color={derived.status === 'ready' ? '#f97316' : '#fb923c'}
                      roughness={0.5}
                    />
                  </mesh>
                )}
                {/* Leafy Carrot Fern Fronds (3 distinct angled plumes) */}
                {[-0.35, 0, 0.35].map((tilt, j) => (
                  <mesh
                    key={j}
                    position={[j === 1 ? 0 : tilt * 0.18, 0.32, (j - 1) * 0.04]}
                    rotation={[tilt * 0.6, j * 1.4, tilt]}
                    castShadow={!isSoftwareGl}
                  >
                    <coneGeometry args={[0.1, 0.56, 6]} />
                    <meshStandardMaterial
                      color={derived.status === 'ready' ? '#16a34a' : '#4ade80'}
                      roughness={0.72}
                    />
                  </mesh>
                ))}
              </group>
            ))}
        </group>
      )}

      {/* Ready-to-Harvest Golden Beacon */}
      {derived.status === 'ready' && (
        <group ref={beaconRef} position={[0, 1.45, 0]}>
          <mesh>
            <octahedronGeometry args={[0.2, 0]} />
            <meshStandardMaterial
              color="#fde047"
              emissive="#f59e0b"
              emissiveIntensity={0.65}
              roughness={0.22}
              metalness={0.4}
            />
          </mesh>
        </group>
      )}
    </group>
  );
}
