import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

export interface BurstEvent {
  id: number;
  x: number;
  z: number;
  kind: 'plant' | 'water' | 'harvest';
}

interface FarmEffectsProps {
  latestBurst: BurstEvent | null;
}

const POOL_SIZE = 96;
const _dummy = new THREE.Object3D();
const _color = new THREE.Color();

interface ParticleSlot {
  active: boolean;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  age: number;
  life: number;
  scale: number;
}

export function FarmEffects({ latestBurst }: FarmEffectsProps) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const cursorRef = useRef(0);
  const lastProcessedId = useRef(0);

  const slots = useMemo<ParticleSlot[]>(
    () =>
      Array.from({ length: POOL_SIZE }, () => ({
        active: false,
        x: 0,
        y: -10,
        z: 0,
        vx: 0,
        vy: 0,
        vz: 0,
        age: 0,
        life: 0.6,
        scale: 0,
      })),
    [],
  );

  const geometry = useMemo(() => new THREE.DodecahedronGeometry(0.11, 0), []);
  const material = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: '#ffffff',
        roughness: 0.35,
        metalness: 0.1,
      }),
    [],
  );

  useEffect(() => {
    return () => {
      geometry.dispose();
      material.dispose();
    };
  }, [geometry, material]);

  useEffect(() => {
    if (!latestBurst || latestBurst.id === lastProcessedId.current) return;
    lastProcessedId.current = latestBurst.id;

    const palette =
      latestBurst.kind === 'water'
        ? ['#38bdf8', '#0ea5e9', '#bae6fd']
        : latestBurst.kind === 'harvest'
          ? ['#facc15', '#f59e0b', '#fef08a']
          : ['#854d0e', '#a16207', '#65a30d'];

    const count = 14;
    for (let i = 0; i < count; i += 1) {
      const idx = cursorRef.current;
      cursorRef.current = (cursorRef.current + 1) % POOL_SIZE;
      const angle = (Math.PI * 2 * i) / count + Math.random() * 0.4;
      const speed = 1.2 + Math.random() * 1.8;
      const slot = slots[idx];
      slot.active = true;
      slot.x = latestBurst.x + (Math.random() - 0.5) * 0.7;
      slot.y = 0.45 + Math.random() * 0.3;
      slot.z = latestBurst.z + (Math.random() - 0.5) * 0.7;
      slot.vx = Math.cos(angle) * speed;
      slot.vy = 2.4 + Math.random() * 1.8;
      slot.vz = Math.sin(angle) * speed;
      slot.age = 0;
      slot.life = 0.55 + Math.random() * 0.3;
      slot.scale = 0.75 + Math.random() * 0.6;

      if (meshRef.current) {
        _color.set(palette[i % palette.length]);
        meshRef.current.setColorAt(idx, _color);
      }
    }
    if (meshRef.current && meshRef.current.instanceColor) {
      meshRef.current.instanceColor.needsUpdate = true;
    }
  }, [latestBurst, slots]);

  useFrame((_, rawDt) => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const dt = Math.min(rawDt, 0.05);
    let anyChanged = false;

    for (let i = 0; i < POOL_SIZE; i += 1) {
      const slot = slots[i];
      if (!slot.active) continue;
      anyChanged = true;
      slot.age += dt;
      if (slot.age >= slot.life) {
        slot.active = false;
        _dummy.position.set(0, -20, 0);
        _dummy.scale.setScalar(0.001);
        _dummy.updateMatrix();
        mesh.setMatrixAt(i, _dummy.matrix);
        continue;
      }

      slot.vy -= 7.8 * dt;
      slot.x += slot.vx * dt;
      slot.y += slot.vy * dt;
      slot.z += slot.vz * dt;
      const fade = Math.max(0.01, 1 - slot.age / slot.life);

      _dummy.position.set(slot.x, Math.max(0.15, slot.y), slot.z);
      _dummy.rotation.set(slot.age * 4, slot.age * 3, 0);
      _dummy.scale.setScalar(slot.scale * fade);
      _dummy.updateMatrix();
      mesh.setMatrixAt(i, _dummy.matrix);
    }

    if (anyChanged) {
      mesh.instanceMatrix.needsUpdate = true;
    }
  });

  return (
    <instancedMesh
      ref={meshRef}
      args={[geometry, material, POOL_SIZE]}
      frustumCulled={false}
    />
  );
}
