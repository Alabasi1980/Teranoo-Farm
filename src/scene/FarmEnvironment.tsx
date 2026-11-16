import { useEffect, useMemo } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import type { SharedFarmTextures } from './materials';

interface FarmEnvironmentProps {
  textures: SharedFarmTextures;
  isSoftwareGl: boolean;
}

interface TreePlacement {
  x: number;
  z: number;
  scale: number;
  rotY: number;
  foliageHex: string;
}

const TREE_PLACEMENTS: TreePlacement[] = [
  { x: -12.5, z: -9.5, scale: 1.15, rotY: 0.4, foliageHex: '#4d8b31' },
  { x: -14.0, z: -2.0, scale: 0.95, rotY: 1.2, foliageHex: '#5ca038' },
  { x: -12.2, z: 6.5, scale: 1.08, rotY: 2.1, foliageHex: '#3f7d29' },
  { x: -7.5, z: -12.2, scale: 1.25, rotY: 0.9, foliageHex: '#559634' },
  { x: 0.2, z: -12.8, scale: 1.05, rotY: 1.7, foliageHex: '#4b8a2f' },
  { x: 8.8, z: -11.5, scale: 1.2, rotY: 2.6, foliageHex: '#63a63e' },
  { x: 13.5, z: -6.2, scale: 1.0, rotY: 0.3, foliageHex: '#4a882e' },
  { x: 14.0, z: 2.8, scale: 1.12, rotY: 1.9, foliageHex: '#5ca038' },
  { x: 11.8, z: 9.2, scale: 0.92, rotY: 2.8, foliageHex: '#3f7d29' },
  { x: -10.5, z: 10.5, scale: 1.02, rotY: 0.7, foliageHex: '#559634' },
  { x: -16.5, z: -14.0, scale: 1.35, rotY: 1.1, foliageHex: '#46822b' },
  { x: 16.2, z: -13.0, scale: 1.3, rotY: 2.2, foliageHex: '#529332' },
];

const HILL_PLACEMENTS = [
  { x: -24, z: -24, rx: 14, ry: 4.2, rz: 12, color: '#78b146' },
  { x: 22, z: -26, rx: 16, ry: 5.0, rz: 13, color: '#6ea73e' },
  { x: 0, z: -30, rx: 18, ry: 4.5, rz: 12, color: '#7db74b' },
  { x: -28, z: 6, rx: 12, ry: 3.4, rz: 14, color: '#74ad42' },
  { x: 28, z: 8, rx: 13, ry: 3.8, rz: 14, color: '#6ca43c' },
];

export function FarmEnvironment({ textures, isSoftwareGl }: FarmEnvironmentProps) {
  const { gl, scene } = useThree();

  // Studio environment reflection via RoomEnvironment + PMREMGenerator
  useEffect(() => {
    const pmremGenerator = new THREE.PMREMGenerator(gl);
    const roomEnv = new RoomEnvironment();
    const envRT = pmremGenerator.fromScene(roomEnv, 0.04);
    scene.environment = envRT.texture;
    roomEnv.dispose();
    pmremGenerator.dispose();
    return () => {
      scene.environment = null;
      envRT.dispose();
    };
  }, [gl, scene]);

  const shared = useMemo(() => {
    const trunkGeo = new THREE.CylinderGeometry(0.2, 0.34, 1.8, 7);
    const rootGeo = new THREE.ConeGeometry(0.46, 0.45, 7);
    const crownBottomGeo = new THREE.ConeGeometry(1.45, 1.8, 7);
    const crownMidGeo = new THREE.ConeGeometry(1.12, 1.5, 7);
    const crownTopGeo = new THREE.ConeGeometry(0.75, 1.2, 7);

    const trunkMat = new THREE.MeshStandardMaterial({
      color: '#7a4b2a',
      roughness: 0.9,
      metalness: 0.02,
    });

    const grassMat = new THREE.MeshStandardMaterial({
      color: '#ffffff',
      map: textures.grassColor,
      bumpMap: textures.bumpNoise,
      bumpScale: 0.04,
      roughness: 0.92,
      metalness: 0.0,
    });

    const pathMat = new THREE.MeshStandardMaterial({
      color: '#d2b48c',
      bumpMap: textures.bumpNoise,
      bumpScale: 0.03,
      roughness: 0.94,
      metalness: 0.0,
    });

    const stoneMat = new THREE.MeshStandardMaterial({
      color: '#ffffff',
      map: textures.stoneColor,
      roughness: 0.88,
      metalness: 0.05,
    });

    const fenceWoodMat = new THREE.MeshStandardMaterial({
      color: '#ffffff',
      map: textures.woodColor,
      roughness: 0.82,
      metalness: 0.02,
    });

    const postGeo = new THREE.BoxGeometry(0.18, 1.05, 0.18);
    const railGeo = new THREE.BoxGeometry(2.2, 0.12, 0.08);
    const shadowDiscGeo = new THREE.CircleGeometry(1.3, 16);
    const shadowDiscMat = new THREE.MeshBasicMaterial({
      color: '#1b2e10',
      transparent: true,
      opacity: 0.24,
      depthWrite: false,
    });

    return {
      trunkGeo,
      rootGeo,
      crownBottomGeo,
      crownMidGeo,
      crownTopGeo,
      trunkMat,
      grassMat,
      pathMat,
      stoneMat,
      fenceWoodMat,
      postGeo,
      railGeo,
      shadowDiscGeo,
      shadowDiscMat,
    };
  }, [textures]);

  useEffect(() => {
    return () => {
      shared.trunkGeo.dispose();
      shared.rootGeo.dispose();
      shared.crownBottomGeo.dispose();
      shared.crownMidGeo.dispose();
      shared.crownTopGeo.dispose();
      shared.trunkMat.dispose();
      shared.grassMat.dispose();
      shared.pathMat.dispose();
      shared.stoneMat.dispose();
      shared.fenceWoodMat.dispose();
      shared.postGeo.dispose();
      shared.railGeo.dispose();
      shared.shadowDiscGeo.dispose();
      shared.shadowDiscMat.dispose();
    };
  }, [shared]);

  // Fence segments forming a cozy farmyard boundary with front entrance opening
  const fenceSegments = useMemo(() => {
    const segs: Array<{ x: number; z: number; rotY: number }> = [];
    // Back fence (z = -8.2)
    for (let x = -8.8; x <= 8.8; x += 2.2) {
      segs.push({ x, z: -8.2, rotY: 0 });
    }
    // Left fence (x = -9.9)
    for (let z = -7.1; z <= 5.5; z += 2.2) {
      segs.push({ x: -9.9, z, rotY: Math.PI / 2 });
    }
    // Right fence (x = 9.9)
    for (let z = -7.1; z <= 5.5; z += 2.2) {
      segs.push({ x: 9.9, z, rotY: Math.PI / 2 });
    }
    // Front fence left & right wings (leaving gap at center x = -2.2 .. 2.2)
    for (const x of [-8.8, -6.6, -4.4, 4.4, 6.6, 8.8]) {
      segs.push({ x, z: 6.4, rotY: 0 });
    }
    return segs;
  }, []);

  return (
    <group>
      {/* Sky background and matching horizon fog */}
      <color attach="background" args={['#cfe8fb']} />
      <fog attach="fog" args={['#cfe8fb', 28, 64]} />

      {/* Warm/Cool Outdoor Lighting Rig (1 shadow-casting key light + Hemisphere fill + soft rim) */}
      <hemisphereLight args={['#c2e5ff', '#6a5b40', 0.62]} />
      <directionalLight
        position={[14, 22, 12]}
        intensity={1.25}
        color="#fff0d0"
        castShadow={!isSoftwareGl}
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
        shadow-camera-near={2}
        shadow-camera-far={55}
        shadow-camera-left={-14}
        shadow-camera-right={14}
        shadow-camera-top={14}
        shadow-camera-bottom={-14}
        shadow-bias={-0.0005}
        shadow-normalBias={0.02}
      />
      <directionalLight position={[-12, 10, -14]} intensity={0.35} color="#bae6fd" />

      {/* Main Extended Meadow */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0, 0]}
        receiveShadow={!isSoftwareGl}
        material={shared.grassMat}
      >
        <planeGeometry args={[96, 96, 1, 1]} />
      </mesh>

      {/* Distant Rolling Hills */}
      {HILL_PLACEMENTS.map((hill, idx) => (
        <mesh
          key={idx}
          position={[hill.x, -0.35, hill.z]}
          scale={[hill.rx, hill.ry, hill.rz]}
          receiveShadow={!isSoftwareGl}
        >
          <sphereGeometry args={[1, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.52]} />
          <meshStandardMaterial color={hill.color} roughness={0.95} metalness={0} />
        </mesh>
      ))}

      {/* Farmyard Dirt Path (offset +0.02 on Y to prevent Z-fighting; starts in front of plots) */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0.02, 6.6]}
        receiveShadow={!isSoftwareGl}
        material={shared.pathMat}
      >
        <planeGeometry args={[3.2, 5.2]} />
      </mesh>
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[-0.2, 0.025, -4.4]}
        receiveShadow={!isSoftwareGl}
        material={shared.pathMat}
      >
        <planeGeometry args={[12.8, 2.1]} />
      </mesh>

      {/* Stepping Stones */}
      {[-0.4, 0.3, -0.2, 0.4].map((offsetX, i) => (
        <mesh
          key={i}
          position={[offsetX, 0.035, 4.6 + i * 1.15]}
          rotation={[-Math.PI / 2, 0, i * 0.6]}
          material={shared.stoneMat}
          receiveShadow={!isSoftwareGl}
        >
          <circleGeometry args={[0.38 - (i % 2) * 0.07, 7]} />
        </mesh>
      ))}

      {/* Wooden Perimeter Fence */}
      {fenceSegments.map((seg, idx) => (
        <group key={idx} position={[seg.x, 0, seg.z]} rotation={[0, seg.rotY, 0]}>
          <mesh
            position={[-1.05, 0.52, 0]}
            geometry={shared.postGeo}
            material={shared.fenceWoodMat}
            castShadow={!isSoftwareGl}
            receiveShadow={!isSoftwareGl}
          />
          <mesh
            position={[0, 0.78, 0]}
            geometry={shared.railGeo}
            material={shared.fenceWoodMat}
            castShadow={!isSoftwareGl}
          />
          <mesh
            position={[0, 0.42, 0]}
            geometry={shared.railGeo}
            material={shared.fenceWoodMat}
            castShadow={!isSoftwareGl}
          />
        </group>
      ))}

      {/* Composite Low-Poly Trees (5 parts per tree + contact shadow) */}
      {TREE_PLACEMENTS.map((tree, idx) => (
        <group
          key={idx}
          position={[tree.x, 0, tree.z]}
          rotation={[0, tree.rotY, 0]}
          scale={tree.scale}
        >
          <mesh
            rotation={[-Math.PI / 2, 0, 0]}
            position={[0, 0.02, 0]}
            geometry={shared.shadowDiscGeo}
            material={shared.shadowDiscMat}
          />
          <mesh
            position={[0, 0.22, 0]}
            geometry={shared.rootGeo}
            material={shared.trunkMat}
            castShadow={!isSoftwareGl}
          />
          <mesh
            position={[0, 0.9, 0]}
            geometry={shared.trunkGeo}
            material={shared.trunkMat}
            castShadow={!isSoftwareGl}
          />
          <mesh
            position={[0, 2.25, 0]}
            geometry={shared.crownBottomGeo}
            castShadow={!isSoftwareGl}
          >
            <meshStandardMaterial color={tree.foliageHex} roughness={0.86} flatShading />
          </mesh>
          <mesh
            position={[0, 3.15, 0]}
            geometry={shared.crownMidGeo}
            castShadow={!isSoftwareGl}
          >
            <meshStandardMaterial color={tree.foliageHex} roughness={0.82} flatShading />
          </mesh>
          <mesh
            position={[0, 3.95, 0]}
            geometry={shared.crownTopGeo}
            castShadow={!isSoftwareGl}
          >
            <meshStandardMaterial color={tree.foliageHex} roughness={0.78} flatShading />
          </mesh>
        </group>
      ))}
    </group>
  );
}
