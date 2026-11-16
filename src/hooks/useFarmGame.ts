import { useCallback, useEffect, useRef, useState } from 'react';
import {
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  type User,
} from 'firebase/auth';
import type { CropId } from '../content/crops';
import { auth, googleProvider, testFirestoreConnection } from '../firebase/config';
import {
  clearPendingLocalSnapshot,
  clearPendingLocalSnapshotIfMatching,
  fetchServerFarm,
  flushCloudSave,
  loadOrCreateCloudFarm,
  rebasePendingLocalSnapshot,
  saveCloudFarmWithRevisionCheck,
  savePendingLocalSnapshot,
} from '../firebase/farmRepository';
import {
  type ConflictState,
  type CoordinatorSnapshot,
  FarmSyncCoordinator,
  type ScreenMode,
} from '../firebase/syncCoordinator';
import {
  buySeeds,
  evaluateRescueGrant,
  harvestPlot,
  plantPlot,
  sellCrops,
  waterPlot,
} from '../game/rules';
import type { ActionOutcome, PlotId, ToolId } from '../game/types';
import { soundEngine } from '../audio/soundEffects';
import type { BurstEvent } from '../scene/FarmEffects';
import { getPlotPosition } from '../scene/FarmCanvas';

export type { ConflictState, ScreenMode };

export interface ToastNotice {
  id: number;
  kind: 'info' | 'success' | 'warning' | 'error';
  text: string;
}

export function useFarmGame() {
  const isAutostartPreview =
    typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).get('autostart') === '1';

  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);

  const [activeTool, setActiveTool] = useState<ToolId>('seed_wheat');
  const [selectedPlotId, setSelectedPlotId] = useState<PlotId | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [muted, setMuted] = useState(false);
  const [resetCameraSignal, setResetCameraSignal] = useState(0);
  const [latestBurst, setLatestBurst] = useState<BurstEvent | null>(null);
  const [toast, setToast] = useState<ToastNotice | null>(null);

  const showToast = useCallback((kind: ToastNotice['kind'], text: string) => {
    setToast({ id: Date.now() + Math.random(), kind, text });
  }, []);

  const coordinatorRef = useRef<FarmSyncCoordinator | null>(null);
  if (!coordinatorRef.current) {
    coordinatorRef.current = new FarmSyncCoordinator({
      isAutostartPreview,
      cloud: {
        testConnection: testFirestoreConnection,
        loadOrCreateCloudFarm,
        fetchServerFarm,
        saveCloudFarmWithRevisionCheck,
        flushCloudSave,
      },
      storage: {
        savePending: savePendingLocalSnapshot,
        clearPending: clearPendingLocalSnapshot,
        clearIfMatching: clearPendingLocalSnapshotIfMatching,
        rebasePending: rebasePendingLocalSnapshot,
      },
    });
  }

  const [syncSnapshot, setSyncSnapshot] = useState<CoordinatorSnapshot>(() =>
    coordinatorRef.current!.getSnapshot(),
  );

  // Connect coordinator listener cleanly for React lifecycle
  useEffect(() => {
    const coord = new FarmSyncCoordinator({
      isAutostartPreview,
      cloud: {
        testConnection: testFirestoreConnection,
        loadOrCreateCloudFarm,
        fetchServerFarm,
        saveCloudFarmWithRevisionCheck,
        flushCloudSave,
      },
      storage: {
        savePending: savePendingLocalSnapshot,
        clearPending: clearPendingLocalSnapshot,
        clearIfMatching: clearPendingLocalSnapshotIfMatching,
        rebasePending: rebasePendingLocalSnapshot,
      },
      onStateChange: (nextSnap) => {
        setSyncSnapshot(nextSnap);
      },
      onToast: (notice) => {
        showToast(notice.kind, notice.text);
      },
    });
    coordinatorRef.current = coord;
    setSyncSnapshot(coord.getSnapshot());

    return () => {
      coord.dispose();
    };
  }, [isAutostartPreview, showToast]);

  // Keep body data-state synced for accessibility & automation
  useEffect(() => {
    document.body.dataset.state = syncSnapshot.screenMode === 'title' ? 'title' : 'playing';
  }, [syncSnapshot.screenMode]);

  // Live growth timer tick (1Hz, UI & growth progression only — never writes to Firestore)
  useEffect(() => {
    if (syncSnapshot.screenMode !== 'playing') return;
    const timer = window.setInterval(() => {
      setNowMs(Date.now());
    }, 1000);
    return () => window.clearInterval(timer);
  }, [syncSnapshot.screenMode]);

  // Subscribe once to Firebase Auth — never re-subscribes when conflict/preview/saveStatus change.
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (nextUser) => {
      setUser(nextUser);
      setAuthReady(true);
      void coordinatorRef.current?.handleAuthChange(nextUser?.uid ?? null);
    });
    return () => unsub();
  }, []);

  // Retry pending saves automatically when browser comes back online
  useEffect(() => {
    const handleOnline = () => {
      void coordinatorRef.current?.handleBrowserOnline();
    };
    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, []);

  const signInWithGoogle = useCallback(async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      if (msg.includes('popup-closed-by-user')) {
        showToast('warning', 'تم إغلاق نافذة تسجيل الدخول قبل إكماله.');
      } else {
        showToast('error', 'تعذر تسجيل الدخول بحساب Google. حاول مرة أخرى.');
      }
    }
  }, [showToast]);

  const handleSignOut = useCallback(async () => {
    await signOut(auth);
    setSelectedPlotId(null);
  }, []);

  const retryLoadCloudFarm = useCallback(() => {
    void coordinatorRef.current?.retryLoad();
  }, []);

  const retryCloudSave = useCallback(() => {
    void coordinatorRef.current?.flushNow();
  }, []);

  const resolveConflictUseServer = useCallback(async () => {
    await coordinatorRef.current?.resolveConflictUseServer();
  }, []);

  const applyOutcome = useCallback(
    (
      outcome: ActionOutcome,
      burst?: { plotId: PlotId; kind: BurstEvent['kind'] },
    ): boolean => {
      const coord = coordinatorRef.current;
      if (!coord || !coord.canAcceptGameplayAction()) return false;

      if (!outcome.ok) {
        soundEngine.playError();
        showToast('warning', outcome.messageAr);
        return false;
      }

      const rescue = evaluateRescueGrant(outcome.state);
      const finalState = rescue.state;
      coord.recordGameplayMutation(finalState);
      setNowMs(Date.now());

      if (burst) {
        const [x, , z] = getPlotPosition(burst.plotId);
        setLatestBurst({ id: Date.now() + Math.random(), x, z, kind: burst.kind });
      }

      if (rescue.granted || outcome.rescueGranted) {
        showToast(
          'info',
          `${outcome.messageAr} كما مُنحت 3 بذور قمح إنقاذية مجانية لمواصلة الزراعة!`,
        );
      } else {
        showToast('success', outcome.messageAr);
      }
      return true;
    },
    [showToast],
  );

  const handlePlotAction = useCallback(
    (plotId: PlotId, toolOverride?: ToolId) => {
      const coord = coordinatorRef.current;
      setSelectedPlotId(plotId);
      if (!coord || !coord.canAcceptGameplayAction()) return;

      const tool = toolOverride ?? activeTool;
      const now = Date.now();
      const current = coord.getSnapshot().farmState;

      if (tool === 'seed_wheat' || tool === 'seed_carrot') {
        const cropId: CropId = tool === 'seed_wheat' ? 'wheat' : 'carrot';
        const outcome = plantPlot(current, plotId, cropId, now);
        if (applyOutcome(outcome, { plotId, kind: 'plant' })) {
          soundEngine.playPlant();
        }
        return;
      }

      if (tool === 'water') {
        const outcome = waterPlot(current, plotId, now);
        if (applyOutcome(outcome, { plotId, kind: 'water' })) {
          soundEngine.playWater();
        }
        return;
      }

      if (tool === 'harvest') {
        const outcome = harvestPlot(current, plotId, now);
        if (applyOutcome(outcome, { plotId, kind: 'harvest' })) {
          soundEngine.playHarvest();
        }
      }
    },
    [activeTool, applyOutcome],
  );

  const handleBuySeeds = useCallback(
    (cropId: CropId, quantity: number) => {
      const coord = coordinatorRef.current;
      if (!coord || !coord.canAcceptGameplayAction()) return;
      const outcome = buySeeds(coord.getSnapshot().farmState, cropId, quantity, Date.now());
      if (applyOutcome(outcome)) {
        soundEngine.playCoin();
      }
    },
    [applyOutcome],
  );

  const handleSellCrops = useCallback(
    (cropId: CropId, quantity: number) => {
      const coord = coordinatorRef.current;
      if (!coord || !coord.canAcceptGameplayAction()) return;
      const outcome = sellCrops(coord.getSnapshot().farmState, cropId, quantity, Date.now());
      if (applyOutcome(outcome)) {
        soundEngine.playCoin();
      }
    },
    [applyOutcome],
  );

  const confirmNewFarm = useCallback(async () => {
    const coord = coordinatorRef.current;
    if (!coord || !coord.canAcceptGameplayAction()) return;
    setSelectedPlotId(null);
    setNowMs(Date.now());
    await coord.confirmNewFarm();
  }, []);

  const toggleMute = useCallback(() => {
    setMuted((prev) => {
      const next = !prev;
      soundEngine.setMuted(next);
      return next;
    });
  }, []);

  const resetCamera = useCallback(() => {
    setResetCameraSignal((n) => n + 1);
  }, []);

  return {
    user,
    authReady,
    screenMode: syncSnapshot.screenMode,
    isLocalPreview: syncSnapshot.isLocalPreview,
    farmState: syncSnapshot.farmState,
    saveStatus: syncSnapshot.saveStatus,
    loadError: syncSnapshot.loadError,
    conflict: syncSnapshot.conflict,
    isResetting: syncSnapshot.isResetting,
    localPersistFailed: syncSnapshot.localPersistFailed,
    cloudWriteVerified: syncSnapshot.cloudWriteVerified,
    activeTool,
    setActiveTool,
    selectedPlotId,
    setSelectedPlotId,
    nowMs,
    muted,
    toggleMute,
    resetCameraSignal,
    resetCamera,
    latestBurst,
    toast,
    dismissToast: () => setToast(null),
    lastSavedAtMs: syncSnapshot.lastSavedAtMs,
    signInWithGoogle,
    handleSignOut,
    retryLoadCloudFarm,
    retryCloudSave,
    resolveConflictUseServer,
    handlePlotAction,
    handleBuySeeds,
    handleSellCrops,
    confirmNewFarm,
  };
}
