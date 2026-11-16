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
  fetchServerFarm,
  loadOrCreateCloudFarm,
  saveCloudFarmWithRevisionCheck,
  savePendingLocalSnapshot,
} from '../firebase/farmRepository';
import { RevisionConflictError } from '../firebase/syncLogic';
import {
  buySeeds,
  createInitialFarmState,
  evaluateRescueGrant,
  harvestPlot,
  plantPlot,
  resetFarmState,
  sellCrops,
  waterPlot,
} from '../game/rules';
import type {
  ActionOutcome,
  FarmState,
  PlotId,
  SaveStatus,
  ToolId,
} from '../game/types';
import { soundEngine } from '../audio/soundEffects';
import type { BurstEvent } from '../scene/FarmEffects';
import { getPlotPosition } from '../scene/FarmCanvas';

export type ScreenMode = 'title' | 'loading_cloud' | 'playing';

export interface ToastNotice {
  id: number;
  kind: 'info' | 'success' | 'warning' | 'error';
  text: string;
}

export interface ConflictState {
  serverState: FarmState;
  localState: FarmState;
}

const SAVE_DEBOUNCE_MS = 1100;

export function useFarmGame() {
  const isAutostartPreview =
    typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).get('autostart') === '1';

  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [screenMode, setScreenMode] = useState<ScreenMode>(
    isAutostartPreview ? 'playing' : 'title',
  );
  const [isLocalPreview, setIsLocalPreview] = useState(isAutostartPreview);

  const [farmState, setFarmState] = useState<FarmState>(() =>
    createInitialFarmState('local-preview'),
  );
  const [saveStatus, setSaveStatus] = useState<SaveStatus>(
    isAutostartPreview ? 'local_preview' : 'idle',
  );
  const [loadError, setLoadError] = useState<string | null>(null);
  const [conflict, setConflict] = useState<ConflictState | null>(null);

  const [activeTool, setActiveTool] = useState<ToolId>('seed_wheat');
  const [selectedPlotId, setSelectedPlotId] = useState<PlotId | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [muted, setMuted] = useState(false);
  const [resetCameraSignal, setResetCameraSignal] = useState(0);
  const [latestBurst, setLatestBurst] = useState<BurstEvent | null>(null);
  const [toast, setToast] = useState<ToastNotice | null>(null);
  const [lastSavedAtMs, setLastSavedAtMs] = useState<number | null>(null);

  const farmStateRef = useRef(farmState);
  farmStateRef.current = farmState;

  const serverRevisionRef = useRef<number>(1);
  const mutationSeqRef = useRef<number>(0);
  const saveTimerRef = useRef<number | null>(null);
  const isSavingRef = useRef(false);
  const userRef = useRef<User | null>(null);
  userRef.current = user;

  const showToast = useCallback((kind: ToastNotice['kind'], text: string) => {
    setToast({ id: Date.now() + Math.random(), kind, text });
  }, []);

  // Keep body data-state synced for accessibility & automation
  useEffect(() => {
    document.body.dataset.state = screenMode === 'title' ? 'title' : 'playing';
  }, [screenMode]);

  // Live growth timer tick (1Hz, UI & growth progression only — never writes to Firestore)
  useEffect(() => {
    if (screenMode !== 'playing') return;
    const timer = window.setInterval(() => {
      setNowMs(Date.now());
    }, 1000);
    return () => window.clearInterval(timer);
  }, [screenMode]);

  // Clear pending timer on unmount
  useEffect(() => {
    return () => {
      if (saveTimerRef.current !== null) {
        window.clearTimeout(saveTimerRef.current);
      }
    };
  }, []);

  const flushCloudSave = useCallback(async () => {
    const activeUser = userRef.current;
    if (!activeUser || isLocalPreview) return;
    if (isSavingRef.current) return;
    if (conflict) return;

    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      setSaveStatus('pending_offline');
      return;
    }

    isSavingRef.current = true;
    setSaveStatus('saving');
    const seqAtStart = mutationSeqRef.current;
    const snapshotToSave = farmStateRef.current;

    try {
      const saved = await saveCloudFarmWithRevisionCheck(
        activeUser.uid,
        snapshotToSave,
        serverRevisionRef.current,
      );
      serverRevisionRef.current = saved.revision;
      setLastSavedAtMs(saved.updatedAtMs);

      // Update revision in state without clobbering newer local edits if any arrived during flight
      setFarmState((prev) => ({
        ...prev,
        revision: saved.revision,
        updatedAtMs: saved.updatedAtMs,
      }));

      if (mutationSeqRef.current !== seqAtStart) {
        // More mutations occurred while saving; schedule follow-up flush
        isSavingRef.current = false;
        setSaveStatus('saving');
        saveTimerRef.current = window.setTimeout(() => {
          void flushCloudSave();
        }, 450);
        return;
      }

      setSaveStatus('saved');
    } catch (error) {
      if (error instanceof RevisionConflictError) {
        setSaveStatus('conflict');
        setConflict({
          serverState: error.serverState,
          localState: snapshotToSave,
        });
        showToast(
          'warning',
          'تم اكتشاف نسخة أحدث من مزرعتك على الخادم. أوقفنا الحفظ القديم لحماية تقدمك.',
        );
      } else {
        const offline = typeof navigator !== 'undefined' && !navigator.onLine;
        setSaveStatus(offline ? 'pending_offline' : 'error');
        showToast(
          'error',
          offline
            ? 'أنت غير متصل حاليًا؛ تم حفظ التعديلات محليًا وستتم المزامنة عند عودة الاتصال.'
            : 'تعذر الحفظ إلى السحابة. التغييرات محفوظة محليًا ويمكنك إعادة المحاولة.',
        );
      }
    } finally {
      isSavingRef.current = false;
    }
  }, [conflict, isLocalPreview, showToast]);

  const scheduleCloudSave = useCallback(
    (nextState: FarmState) => {
      if (isLocalPreview || !userRef.current) return;
      mutationSeqRef.current += 1;

      savePendingLocalSnapshot({
        uid: userRef.current.uid,
        baseRevision: serverRevisionRef.current,
        state: nextState,
        queuedAtMs: Date.now(),
      });

      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        setSaveStatus('pending_offline');
        return;
      }

      setSaveStatus('saving');
      if (saveTimerRef.current !== null) {
        window.clearTimeout(saveTimerRef.current);
      }
      saveTimerRef.current = window.setTimeout(() => {
        saveTimerRef.current = null;
        void flushCloudSave();
      }, SAVE_DEBOUNCE_MS);
    },
    [flushCloudSave, isLocalPreview],
  );

  const loadUserCloudFarm = useCallback(
    async (firebaseUser: User) => {
      setScreenMode('loading_cloud');
      setSaveStatus('loading');
      setLoadError(null);
      setConflict(null);

      try {
        const conn = await testFirestoreConnection();
        if (!conn.reachable) {
          throw new Error('تعذر الاتصال بخدمة Cloud Firestore. تحقق من اتصالك بالإنترنت.');
        }

        const { resolution, createdInitial } = await loadOrCreateCloudFarm(firebaseUser.uid);

        if (resolution.kind === 'use_server') {
          const rescueCheck = evaluateRescueGrant(resolution.state);
          serverRevisionRef.current = resolution.state.revision;
          setFarmState(rescueCheck.state);
          setLastSavedAtMs(resolution.state.updatedAtMs);
          setSaveStatus('saved');
          setScreenMode('playing');
          if (rescueCheck.granted) {
            scheduleCloudSave(rescueCheck.state);
            showToast('info', 'تم منحك 3 بذور قمح إنقاذية لتتمكن من مواصلة الزراعة!');
          } else if (createdInitial) {
            showToast('success', 'أهلًا بك في مزرعتك الجديدة! تم إنشاء حفظك السحابي.');
          }
        } else if (resolution.kind === 'retry_pending') {
          serverRevisionRef.current = resolution.baseRevision;
          setFarmState(resolution.state);
          setSaveStatus('pending_offline');
          setScreenMode('playing');
          showToast('info', 'تم العثور على تعديلات محلية غير متزامنة، جارٍ رفعها الآن...');
          void flushCloudSave();
        } else if (resolution.kind === 'conflict') {
          serverRevisionRef.current = resolution.serverState.revision;
          setFarmState(resolution.pendingState);
          setSaveStatus('conflict');
          setConflict({
            serverState: resolution.serverState,
            localState: resolution.pendingState,
          });
          setScreenMode('playing');
        }
      } catch (error) {
        const rawMessage =
          error instanceof Error
            ? error.message
            : 'حدث خطأ غير متوقع أثناء تحميل بيانات المزرعة.';
        let userMessage = rawMessage;
        if (rawMessage.includes('Quota exceeded')) {
          userMessage =
            'تم بلوغ حد الاستخدام اليومي المجاني لقاعدة البيانات. يُعاد ضبط الحصة تلقائيًا في اليوم التالي.';
        } else if (
          rawMessage.includes('Missing or insufficient permissions') ||
          rawMessage.includes('permission-denied')
        ) {
          userMessage =
            'تعذر الوصول إلى حفظ المزرعة بسبب صلاحيات قاعدة البيانات. يرجى المحاولة مجددًا بعد التأكد من تفعيل حساب Google وبريده الموثق.';
        }
        setLoadError(userMessage);
        setSaveStatus('error');
      }
    },
    [flushCloudSave, scheduleCloudSave, showToast],
  );

  // Firebase Auth listener
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (nextUser) => {
      setUser(nextUser);
      setAuthReady(true);

      if (nextUser) {
        setIsLocalPreview(false);
        void loadUserCloudFarm(nextUser);
      } else if (!isAutostartPreview) {
        setScreenMode('title');
        setSaveStatus('idle');
        setConflict(null);
        setLoadError(null);
      }
    });
    return () => unsub();
  }, [isAutostartPreview, loadUserCloudFarm]);

  // Retry pending saves automatically when browser comes back online
  useEffect(() => {
    const handleOnline = () => {
      if (userRef.current && !isLocalPreview && !conflict) {
        if (saveStatus === 'pending_offline' || saveStatus === 'error') {
          void flushCloudSave();
        }
      }
    };
    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, [conflict, flushCloudSave, isLocalPreview, saveStatus]);

  const signInWithGoogle = useCallback(async () => {
    setLoadError(null);
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
    if (saveTimerRef.current !== null) {
      window.clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    await signOut(auth);
    setSelectedPlotId(null);
    setConflict(null);
    setScreenMode('title');
    setSaveStatus('idle');
  }, []);

  const retryLoadCloudFarm = useCallback(() => {
    if (userRef.current) {
      void loadUserCloudFarm(userRef.current);
    }
  }, [loadUserCloudFarm]);

  const retryCloudSave = useCallback(() => {
    void flushCloudSave();
  }, [flushCloudSave]);

  const resolveConflictUseServer = useCallback(async () => {
    const activeUser = userRef.current;
    if (!activeUser) return;
    if (saveTimerRef.current !== null) {
      window.clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    setSaveStatus('loading');
    try {
      const latestServer = await fetchServerFarm(activeUser.uid);
      if (latestServer) {
        clearPendingLocalSnapshot(activeUser.uid);
        serverRevisionRef.current = latestServer.revision;
        setFarmState(latestServer);
        setLastSavedAtMs(latestServer.updatedAtMs);
        setConflict(null);
        setSaveStatus('saved');
        showToast('success', 'تم تحميل أحدث نسخة محفوظة من السحابة بنجاح.');
      }
    } catch {
      setSaveStatus('error');
      showToast('error', 'تعذر تحميل النسخة الأحدث. تحقق من الاتصال وحاول مجددًا.');
    }
  }, [showToast]);

  const applyOutcome = useCallback(
    (
      outcome: ActionOutcome,
      burst?: { plotId: PlotId; kind: BurstEvent['kind'] },
    ): boolean => {
      if (!outcome.ok) {
        soundEngine.playError();
        showToast('warning', outcome.messageAr);
        return false;
      }

      const rescue = evaluateRescueGrant(outcome.state);
      const finalState = rescue.state;
      setFarmState(finalState);
      setNowMs(Date.now());
      scheduleCloudSave(finalState);

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
    [scheduleCloudSave, showToast],
  );

  const handlePlotAction = useCallback(
    (plotId: PlotId, toolOverride?: ToolId) => {
      setSelectedPlotId(plotId);
      if (conflict || screenMode !== 'playing') return;

      const tool = toolOverride ?? activeTool;
      const now = Date.now();
      const current = farmStateRef.current;

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
    [activeTool, applyOutcome, conflict, screenMode],
  );

  const handleBuySeeds = useCallback(
    (cropId: CropId, quantity: number) => {
      if (conflict || screenMode !== 'playing') return;
      const outcome = buySeeds(farmStateRef.current, cropId, quantity, Date.now());
      if (applyOutcome(outcome)) {
        soundEngine.playCoin();
      }
    },
    [applyOutcome, conflict, screenMode],
  );

  const handleSellCrops = useCallback(
    (cropId: CropId, quantity: number) => {
      if (conflict || screenMode !== 'playing') return;
      const outcome = sellCrops(farmStateRef.current, cropId, quantity, Date.now());
      if (applyOutcome(outcome)) {
        soundEngine.playCoin();
      }
    },
    [applyOutcome, conflict, screenMode],
  );

  const confirmNewFarm = useCallback(async () => {
    if (saveTimerRef.current !== null) {
      window.clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }

    const fresh = resetFarmState(farmStateRef.current, Date.now());
    setFarmState(fresh);
    setSelectedPlotId(null);
    setNowMs(Date.now());

    if (isLocalPreview || !userRef.current) {
      showToast('success', 'تمت إعادة بدء المزرعة بنجاح.');
      return;
    }

    const activeUser = userRef.current;
    setSaveStatus('saving');
    try {
      const saved = await saveCloudFarmWithRevisionCheck(
        activeUser.uid,
        fresh,
        serverRevisionRef.current,
      );
      serverRevisionRef.current = saved.revision;
      setFarmState(saved);
      setLastSavedAtMs(saved.updatedAtMs);
      setSaveStatus('saved');
      showToast('success', 'تمت إعادة بدء مزرعتك وحفظها في السحابة.');
    } catch (error) {
      if (error instanceof RevisionConflictError) {
        setSaveStatus('conflict');
        setConflict({
          serverState: error.serverState,
          localState: fresh,
        });
      } else {
        savePendingLocalSnapshot({
          uid: activeUser.uid,
          baseRevision: serverRevisionRef.current,
          state: fresh,
          queuedAtMs: Date.now(),
        });
        setSaveStatus('error');
        showToast('error', 'أُعيد ضبط المزرعة محليًا، وتعذر الرفع للسحابة حاليًا.');
      }
    }
  }, [isLocalPreview, showToast]);

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
    screenMode,
    isLocalPreview,
    farmState,
    saveStatus,
    loadError,
    conflict,
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
    lastSavedAtMs,
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
