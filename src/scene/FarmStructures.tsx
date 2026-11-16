import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import type { SharedFarmTextures } from './materials';

interface FarmStructuresProps {
  textures: SharedFarmTextures;
  isSoftwareGl: boolean;
}

export function FarmStructures({ textures, isSoftwareGl }: FarmStructuresProps) {
  const mats = useMemo(() => {
    const stone = new THREE.MeshStandardMaterial({
      color: '#ffffff',
      map: textures.stoneColor,
      bumpMap: textures.bumpNoise,
      bumpScale: 0.04,
      roughness: 0.88,
      metalness: 0.04,
    });
    const timber = new THREE.MeshStandardMaterial({
      color: '#ffffff',
      map: textures.woodColor,
      roughness: 0.78,
      metalness: 0.03,
    });
    const darkWood = new THREE.MeshStandardMaterial({
      color: '#5c3a21',
      roughness: 0.75,
      metalness: 0.05,
    });
    const barnWall = new THREE.MeshStandardMaterial({
      color: '#efe2c6',
      bumpMap: textures.bumpNoise,
      bumpScale: 0.02,
      roughness: 0.82,
      metalness: 0.02,
    });
    const roofTile = new THREE.MeshStandardMaterial({
      color: '#b84a39',
      roughness: 0.62,
      metalness: 0.06,
    });
    const water = new THREE.MeshStandardMaterial({
      color: '#2b8cbe',
      roughness: 0.14,
      metalness: 0.18,
    });
    const iron = new THREE.MeshStandardMaterial({
      color: '#4b5563',
      roughness: 0.32,
      metalness: 0.82,
    });
    const hay = new THREE.MeshStandardMaterial({
      color: '#e6b84c',
      roughness: 0.94,
      metalness: 0.0,
    });
    const shadowDisc = new THREE.MeshBasicMaterial({
      color: '#1e2c14',
      transparent: true,
      opacity: 0.28,
      depthWrite: false,
    });
    return { stone, timber, darkWood, barnWall, roofTile, water, iron, hay, shadowDisc };
  }, [textures]);

  const gableGeo = useMemo(() => {
    const shape = new THREE.Shape();
    shape.moveTo(-1.7, 0);
    shape.lineTo(1.7, 0);
    shape.lineTo(0, 1.18);
    shape.closePath();
    const geo = new THREE.ExtrudeGeometry(shape, {
      depth: 2.78,
      bevelEnabled: false,
    });
    geo.translate(0, 0, -1.39);
    return geo;
  }, []);

  useEffect(() => {
    return () => {
      gableGeo.dispose();
      Object.values(mats).forEach((m) => m.dispose());
    };
  }, [gableGeo, mats]);

  return (
    <group>
      {/* ==================== COMPOSITE FARM WELL (10 parts) ==================== */}
      <group position={[-6.8, 0, -4.4]} rotation={[0, 0.35, 0]}>
        {/* Contact shadow */}
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]} material={mats.shadowDisc}>
          <circleGeometry args={[1.65, 20]} />
        </mesh>

        {/* 1. Stone foundation plinth */}
        <mesh
          position={[0, 0.12, 0]}
          material={mats.stone}
          castShadow={!isSoftwareGl}
          receiveShadow={!isSoftwareGl}
        >
          <cylinderGeometry args={[1.3, 1.4, 0.24, 12]} />
        </mesh>

        {/* 2. Stone masonry cylinder wall */}
        <mesh
          position={[0, 0.56, 0]}
          material={mats.stone}
          castShadow={!isSoftwareGl}
          receiveShadow={!isSoftwareGl}
        >
          <cylinderGeometry args={[1.05, 1.12, 0.72, 12]} />
        </mesh>

        {/* 3. Top stone rim ring */}
        <mesh
          position={[0, 0.96, 0]}
          rotation={[Math.PI / 2, 0, 0]}
          material={mats.stone}
          castShadow={!isSoftwareGl}
        >
          <torusGeometry args={[0.98, 0.12, 8, 16]} />
        </mesh>

        {/* 4. Glossy water disc inside well */}
        <mesh position={[0, 0.93, 0]} rotation={[-Math.PI / 2, 0, 0]} material={mats.water}>
          <circleGeometry args={[0.92, 16]} />
        </mesh>

        {/* 5 & 6. Upright wooden roof posts */}
        <mesh position={[-0.92, 1.65, 0]} material={mats.darkWood} castShadow={!isSoftwareGl}>
          <boxGeometry args={[0.16, 1.65, 0.16]} />
        </mesh>
        <mesh position={[0.92, 1.65, 0]} material={mats.darkWood} castShadow={!isSoftwareGl}>
          <boxGeometry args={[0.16, 1.65, 0.16]} />
        </mesh>

        {/* 7. Winch crossbeam & crank */}
        <mesh
          position={[0, 1.62, 0]}
          rotation={[0, 0, Math.PI / 2]}
          material={mats.timber}
          castShadow={!isSoftwareGl}
        >
          <cylinderGeometry args={[0.07, 0.07, 1.85, 8]} />
        </mesh>
        <mesh position={[1.06, 1.62, 0]} material={mats.iron}>
          <boxGeometry args={[0.18, 0.06, 0.06]} />
        </mesh>
        <mesh
          position={[1.15, 1.5, 0]}
          material={mats.darkWood}
        >
          <cylinderGeometry args={[0.04, 0.04, 0.25, 8]} />
        </mesh>

        {/* 8. Hanging rope + wooden bucket with iron rim */}
        <mesh position={[0, 1.38, 0]} material={mats.hay}>
          <cylinderGeometry args={[0.025, 0.025, 0.52, 6]} />
        </mesh>
        <mesh position={[0, 1.12, 0]} material={mats.timber} castShadow={!isSoftwareGl}>
          <cylinderGeometry args={[0.2, 0.15, 0.28, 10]} />
        </mesh>
        <mesh
          position={[0, 1.24, 0]}
          rotation={[Math.PI / 2, 0, 0]}
          material={mats.iron}
        >
          <torusGeometry args={[0.2, 0.022, 6, 12]} />
        </mesh>

        {/* 9 & 10. Pitched shingle roof + ridge beam */}
        <mesh
          position={[-0.58, 2.52, 0]}
          rotation={[0, 0, 0.58]}
          material={mats.roofTile}
          castShadow={!isSoftwareGl}
        >
          <boxGeometry args={[1.45, 0.1, 1.75]} />
        </mesh>
        <mesh
          position={[0.58, 2.52, 0]}
          rotation={[0, 0, -0.58]}
          material={mats.roofTile}
          castShadow={!isSoftwareGl}
        >
          <boxGeometry args={[1.45, 0.1, 1.75]} />
        </mesh>
        <mesh position={[0, 2.86, 0]} material={mats.darkWood}>
          <boxGeometry args={[0.16, 0.16, 1.82]} />
        </mesh>
      </group>

      {/* ==================== COMPOSITE WAREHOUSE / BARN (12 parts) ==================== */}
      <group position={[6.5, 0, -4.6]} rotation={[0, -0.28, 0]}>
        {/* Contact shadow */}
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]} material={mats.shadowDisc}>
          <circleGeometry args={[2.8, 24]} />
        </mesh>

        {/* 1. Stone foundation */}
        <mesh
          position={[0, 0.16, 0]}
          material={mats.stone}
          castShadow={!isSoftwareGl}
          receiveShadow={!isSoftwareGl}
        >
          <boxGeometry args={[3.7, 0.32, 3.1]} />
        </mesh>

        {/* 2. Main barn timber body */}
        <mesh
          position={[0, 1.25, 0]}
          material={mats.barnWall}
          castShadow={!isSoftwareGl}
          receiveShadow={!isSoftwareGl}
        >
          <boxGeometry args={[3.4, 1.9, 2.8]} />
        </mesh>

        {/* 3. Exact Gable Triangle */}
        <mesh
          position={[0, 2.2, 0]}
          geometry={gableGeo}
          material={mats.barnWall}
          castShadow={!isSoftwareGl}
        />

        {/* 4 & 5. Pitched terracotta roof slopes (angle = atan2(1.18, 1.7) = 0.607 rad) */}
        <mesh
          position={[-0.96, 2.8, 0]}
          rotation={[0, 0, 0.607]}
          material={mats.roofTile}
          castShadow={!isSoftwareGl}
        >
          <boxGeometry args={[2.35, 0.14, 3.22]} />
        </mesh>
        <mesh
          position={[0.96, 2.8, 0]}
          rotation={[0, 0, -0.607]}
          material={mats.roofTile}
          castShadow={!isSoftwareGl}
        >
          <boxGeometry args={[2.35, 0.14, 3.22]} />
        </mesh>

        {/* 6. Roof ridge timber cap */}
        <mesh position={[0, 3.42, 0]} material={mats.darkWood}>
          <boxGeometry args={[0.2, 0.2, 3.28]} />
        </mesh>

        {/* 7 & 8. Double wooden barn doors + frame */}
        <mesh position={[0, 1.05, 1.42]} material={mats.darkWood}>
          <boxGeometry args={[1.54, 1.68, 0.08]} />
        </mesh>
        <mesh position={[-0.36, 1.02, 1.46]} material={mats.timber} castShadow={!isSoftwareGl}>
          <boxGeometry args={[0.66, 1.54, 0.06]} />
        </mesh>
        <mesh position={[0.36, 1.02, 1.46]} material={mats.timber} castShadow={!isSoftwareGl}>
          <boxGeometry args={[0.66, 1.54, 0.06]} />
        </mesh>

        {/* 9. Iron door handles */}
        <mesh position={[-0.1, 1.02, 1.51]} material={mats.iron}>
          <boxGeometry args={[0.06, 0.22, 0.05]} />
        </mesh>
        <mesh position={[0.1, 1.02, 1.51]} material={mats.iron}>
          <boxGeometry args={[0.06, 0.22, 0.05]} />
        </mesh>

        {/* 10. Upper loft shuttered window */}
        <mesh position={[0, 2.38, 1.42]} material={mats.darkWood}>
          <boxGeometry args={[0.62, 0.54, 0.1]} />
        </mesh>

        {/* 11. Hay bales stacked beside warehouse */}
        <mesh
          position={[-2.15, 0.34, 0.7]}
          rotation={[0, 0.2, Math.PI / 2]}
          material={mats.hay}
          castShadow={!isSoftwareGl}
          receiveShadow={!isSoftwareGl}
        >
          <cylinderGeometry args={[0.34, 0.34, 0.72, 10]} />
        </mesh>
        <mesh
          position={[-2.1, 0.34, -0.08]}
          rotation={[0, -0.15, Math.PI / 2]}
          material={mats.hay}
          castShadow={!isSoftwareGl}
          receiveShadow={!isSoftwareGl}
        >
          <cylinderGeometry args={[0.34, 0.34, 0.72, 10]} />
        </mesh>

        {/* 12. Wooden storage crate */}
        <mesh
          position={[2.1, 0.32, 0.85]}
          rotation={[0, 0.25, 0]}
          material={mats.timber}
          castShadow={!isSoftwareGl}
          receiveShadow={!isSoftwareGl}
        >
          <boxGeometry args={[0.64, 0.64, 0.64]} />
        </mesh>
      </group>
    </group>
  );
}
