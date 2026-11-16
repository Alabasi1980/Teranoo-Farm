import { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import type { PlotId, PlotState } from '../game/types';
import { FarmEffects, type BurstEvent } from './FarmEffects';
import { FarmEnvironment } from './FarmEnvironment';
import { FarmStructures } from './FarmStructures';
import {
  checkWebGLSupport,
  createSharedFarmTextures,
  detectSoftwareWebGL,
  disposeSharedFarmTextures,
} from './materials';
import { PlotMesh } from './PlotMesh';

const PLOT_COORDINATES: Record<PlotId, [number, number, number]> = {
  'plot-1': [-3.3, 0, -1.2],
  'plot-2': [0, 0, -1.2],
  'plot-3': [3.3, 0, -1.2],
  'plot-4': [-3.3, 0, 2.0],
  'plot-5': [0, 0, 2.0],
  'plot-6': [3.3, 0, 2.0],
};

const DEFAULT_CAMERA_POS = new THREE.Vector3(0.4, 11.2, 13.6);
const DEFAULT_CAMERA_TARGET = new THREE.Vector3(0, 0.4, -0.4);

interface CameraControllerProps {
  controlsRef: React.RefObject<OrbitControlsImpl | null>;
  isTitleMode: boolean;
  isSoftwareGl: boolean;
  resetSignal: number;
}

function CameraController({
  controlsRef,
  isTitleMode,
  isSoftwareGl,
  resetSignal,
}: CameraControllerProps) {
  const { camera, size } = useThree();
  const resettingRef = useRef(false);
  const lastResetSignal = useRef(resetSignal);

  useEffect(() => {
    if (camera instanceof THREE.PerspectiveCamera) {
      const aspect = size.width / Math.max(1, size.height);
      const targetFov = aspect < 0.75 ? 58 : aspect < 1 ? 50 : 42;
      if (camera.fov !== targetFov) {
        camera.fov = targetFov;
        camera.updateProjectionMatrix();
      }
    }
  }, [camera, size.width, size.height]);

  useEffect(() => {
    if (resetSignal !== lastResetSignal.current) {
      lastResetSignal.current = resetSignal;
      resettingRef.current = true;
    }
  }, [resetSignal]);

  useFrame((state, rawDt) => {
    const dt = Math.min(rawDt, 0.05);
    const controls = controlsRef.current;

    if (isTitleMode) {
      const t = state.clock.getElapsedTime();
      const angle = t * 0.14;
      camera.position.x = Math.sin(angle) * 14.5;
      camera.position.z = Math.cos(angle) * 14.5;
      camera.position.y = 10.6 + Math.sin(t * 0.4) * 0.5;
      camera.lookAt(0, 0.8, -0.8);
      return;
    }

    if (resettingRef.current && controls) {
      const factor = 1 - Math.exp(-7 * dt);
      camera.position.lerp(DEFAULT_CAMERA_POS, factor);
      controls.target.lerp(DEFAULT_CAMERA_TARGET, factor);
      controls.update();
      if (
        camera.position.distanceTo(DEFAULT_CAMERA_POS) < 0.05 &&
        controls.target.distanceTo(DEFAULT_CAMERA_TARGET) < 0.05
      ) {
        camera.position.copy(DEFAULT_CAMERA_POS);
        controls.target.copy(DEFAULT_CAMERA_TARGET);
        controls.update();
        resettingRef.current = false;
      }
    }
  });

  if (isTitleMode) return null;

  return (
    <OrbitControls
      ref={controlsRef}
      makeDefault
      enableDamping={!isSoftwareGl}
      dampingFactor={0.07}
      enablePan
      minDistance={7}
      maxDistance={24}
      minPolarAngle={Math.PI / 7}
      maxPolarAngle={Math.PI / 2.35}
      minAzimuthAngle={-Math.PI / 2.2}
      maxAzimuthAngle={Math.PI / 2.2}
      target={[DEFAULT_CAMERA_TARGET.x, DEFAULT_CAMERA_TARGET.y, DEFAULT_CAMERA_TARGET.z]}
      onStart={() => {
        resettingRef.current = false;
      }}
    />
  );
}

/**
 * On software WebGL (SwiftShader / llvmpipe), paces frames with WebGL fenceSync + 90ms idle pause
 * so CPU rasterization never starves browser interaction or Playwright screenshot capture.
 */
function SoftwareGlPacer({ active }: { active: boolean }) {
  const { gl, invalidate } = useThree();

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    let timerId = 0;

    const scheduleNext = () => {
      if (cancelled) return;
      const context = gl.getContext() as WebGL2RenderingContext | null;
      if (context && typeof context.fenceSync === 'function') {
        const sync = context.fenceSync(context.SYNC_GPU_COMMANDS_COMPLETE, 0);
        context.flush();
        const poll = () => {
          if (cancelled) {
            if (sync) context.deleteSync(sync);
            return;
          }
          const status = sync
            ? context.getSyncParameter(sync, context.SYNC_STATUS)
            : context.SIGNALED;
          if (status === context.UNSIGNALED) {
            timerId = window.setTimeout(poll, 8);
          } else {
            if (sync) context.deleteSync(sync);
            timerId = window.setTimeout(() => {
              if (!cancelled) {
                invalidate();
                scheduleNext();
              }
            }, 95);
          }
        };
        timerId = window.setTimeout(poll, 8);
      } else {
        timerId = window.setTimeout(() => {
          if (!cancelled) {
            invalidate();
            scheduleNext();
          }
        }, 110);
      }
    };

    invalidate();
    scheduleNext();

    return () => {
      cancelled = true;
      window.clearTimeout(timerId);
    };
  }, [active, gl, invalidate]);

  return null;
}

export interface FarmCanvasProps {
  plots: PlotState[];
  selectedPlotId: PlotId | null;
  nowMs: number;
  isTitleMode: boolean;
  resetCameraSignal: number;
  latestBurst: BurstEvent | null;
  onPlotInteract: (plotId: PlotId) => void;
}

export function FarmCanvas({
  plots,
  selectedPlotId,
  nowMs,
  isTitleMode,
  resetCameraSignal,
  latestBurst,
  onPlotInteract,
}: FarmCanvasProps) {
  const [hasWebGL] = useState(() => checkWebGLSupport());
  const [isSoftwareGl] = useState(() => detectSoftwareWebGL());
  const controlsRef = useRef<OrbitControlsImpl | null>(null);
  const textures = useMemo(() => createSharedFarmTextures(), []);

  useEffect(() => {
    return () => {
      disposeSharedFarmTextures(textures);
    };
  }, [textures]);

  if (!hasWebGL) {
    return (
      <div
        className="flex h-full w-full items-center justify-center bg-[#e8f3dc] p-6 text-center"
        data-testid="webgl-fallback"
      >
        <div className="max-w-md rounded-2xl border-2 border-[#b6986d] bg-[#fdf9ee] p-6 shadow-xl">
          <h2 className="mb-2 text-xl font-extrabold text-[#3f2c17]">
            تعذر تشغيل العرض ثلاثي الأبعاد (WebGL)
          </h2>
          <p className="text-sm leading-relaxed text-[#6b5235]">
            متصفحك الحالي لا يدعم WebGL أو تم تعطيله في إعدادات الجهاز. يُرجى تفعيل تسريع الرسوميات
            أو تجربة متصفح حديث لفتح مزرعتك.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      className="h-full w-full"
      data-testid="farm-canvas-container"
      data-software-gl={isSoftwareGl ? '1' : '0'}
    >
      <Canvas
        frameloop={isSoftwareGl ? 'demand' : 'always'}
        dpr={isSoftwareGl ? 1 : [1, 2]}
        shadows={!isSoftwareGl}
        camera={{
          position: [DEFAULT_CAMERA_POS.x, DEFAULT_CAMERA_POS.y, DEFAULT_CAMERA_POS.z],
          fov: 42,
          near: 0.5,
          far: 120,
        }}
        gl={{
          antialias: !isSoftwareGl,
          powerPreference: 'high-performance',
          toneMapping: THREE.ACESFilmicToneMapping,
          toneMappingExposure: 0.98,
        }}
      >
        <SoftwareGlPacer active={isSoftwareGl} />
        <CameraController
          controlsRef={controlsRef}
          isTitleMode={isTitleMode}
          isSoftwareGl={isSoftwareGl}
          resetSignal={resetCameraSignal}
        />

        <FarmEnvironment textures={textures} isSoftwareGl={isSoftwareGl} />
        <FarmStructures textures={textures} isSoftwareGl={isSoftwareGl} />

        {plots.map((plot) => (
          <PlotMesh
            key={plot.id}
            plot={plot}
            position={PLOT_COORDINATES[plot.id]}
            isSelected={selectedPlotId === plot.id}
            isSoftwareGl={isSoftwareGl}
            textures={textures}
            nowMs={nowMs}
            onPlotInteract={onPlotInteract}
          />
        ))}

        <FarmEffects latestBurst={latestBurst} />
      </Canvas>
    </div>
  );
}

export function getPlotPosition(plotId: PlotId): [number, number, number] {
  return PLOT_COORDINATES[plotId];
}
