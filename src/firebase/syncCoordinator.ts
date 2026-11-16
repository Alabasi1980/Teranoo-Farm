import {
  createInitialFarmState,
  evaluateRescueGrant,
  resetFarmState,
} from '../game/rules';
import type { FarmState, SaveStatus } from '../game/types';
import type { ConnectionCheckResult } from './connectionCheck';
import type { PendingPersistResult } from './farmRepository';
import {
  assertOwnerUidMatch,
  type LoadResolution,
  type PendingLocalSnapshot,
  RevisionConflictError,
} from './syncLogic';

export type ScreenMode = 'title' | 'loading_cloud' | 'playing';

export interface ToastNoticePayload {
  kind: 'info' | 'success' | 'warning' | 'error';
  text: string;
}

export interface ConflictState {
  serverState: FarmState;
  localState: FarmState;
}

export interface CoordinatorSnapshot {
  screenMode: ScreenMode;
  isLocalPreview: boolean;
  activeUid: string | null;
  farmState: FarmState;
  saveStatus: SaveStatus;
  loadError: string | null;
  conflict: ConflictState | null;
  lastSavedAtMs: number | null;
  isResetting: boolean;
  localPersistFailed: boolean;
  cloudWriteVerified: boolean;
}

export interface CloudFarmPort {
  testConnection(): Promise<ConnectionCheckResult>;
  loadOrCreateCloudFarm(uid: string): Promise<{
    resolution: LoadResolution;
    createdInitial: boolean;
  }>;
  fetchServerFarm(uid: string): Promise<FarmState | null>;
  saveCloudFarmWithRevisionCheck(
    uid: string,
    stateToSave: FarmState,
    expectedServerRevision: number,
  ): Promise<FarmState>;
  flushCloudSave?(
    uid: string,
    stateToSave: FarmState,
    expectedServerRevision: number,
    expectedSeq: number,
  ): Promise<FarmState>;
}

export interface PendingStoragePort {
  savePending(snapshot: PendingLocalSnapshot): PendingPersistResult;
  clearPending(uid: string): PendingPersistResult;
  clearIfMatching(uid: string, expectedSeq: number): PendingPersistResult;
  rebasePending(uid: string, confirmedSeq: number, newBaseRevision: number): PendingPersistResult;
}

export interface CoordinatorOptions {
  isAutostartPreview?: boolean;
  debounceMs?: number;
  followUpDelayMs?: number;
  isOnline?: () => boolean;
  now?: () => number;
  cloud: CloudFarmPort;
  storage: PendingStoragePort;
  onStateChange?: (snapshot: CoordinatorSnapshot) => void;
  onToast?: (notice: ToastNoticePayload) => void;
}

const DEFAULT_DEBOUNCE_MS = 1100;
const DEFAULT_FOLLOWUP_DELAY_MS = 120;

export class FarmSyncCoordinator {
  private readonly isAutostartPreview: boolean;
  private readonly debounceMs: number;
  private readonly followUpDelayMs: number;
  private readonly isOnlineFn: () => boolean;
  private readonly nowFn: () => number;
  private readonly cloud: CloudFarmPort;
  private readonly storage: PendingStoragePort;
  private readonly onStateChange?: (snapshot: CoordinatorSnapshot) => void;
  private readonly onToast?: (notice: ToastNoticePayload) => void;

  private state: CoordinatorSnapshot;
  private sessionId = 0;
  private mutationSeq = 0;
  private confirmedSeq = 0;
  private serverRevision = 1;
  private pendingStateToSave: { seq: number; state: FarmState } | null = null;
  private inFlightSave: {
    seq: number;
    sessionId: number;
    uid: string;
    promise: Promise<void>;
  } | null = null;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(options: CoordinatorOptions) {
    this.isAutostartPreview = Boolean(options.isAutostartPreview);
    this.debounceMs = options.debounceMs ?? DEFAULT_DEBOUNCE_MS;
    this.followUpDelayMs = options.followUpDelayMs ?? DEFAULT_FOLLOWUP_DELAY_MS;
    this.isOnlineFn =
      options.isOnline ??
      (() =>
        typeof navigator === 'undefined' || typeof navigator.onLine !== 'boolean'
          ? true
          : navigator.onLine);
    this.nowFn = options.now ?? (() => Date.now());
    this.cloud = options.cloud;
    this.storage = options.storage;
    this.onStateChange = options.onStateChange;
    this.onToast = options.onToast;

    this.state = {
      screenMode: this.isAutostartPreview ? 'playing' : 'title',
      isLocalPreview: this.isAutostartPreview,
      activeUid: null,
      farmState: createInitialFarmState('local-preview', this.nowFn()),
      saveStatus: this.isAutostartPreview ? 'local_preview' : 'idle',
      loadError: null,
      conflict: null,
      lastSavedAtMs: null,
      isResetting: false,
      localPersistFailed: false,
      cloudWriteVerified: false,
    };
  }

  public getSnapshot(): CoordinatorSnapshot {
    return this.state;
  }

  public canAcceptGameplayAction(): boolean {
    return (
      this.state.screenMode === 'playing' &&
      !this.state.conflict &&
      !this.state.isResetting
    );
  }

  public getPendingWritePromise(): Promise<void> | null {
    return this.inFlightSave?.promise ?? null;
  }

  public dispose(): void {
    this.clearTimers();
    this.sessionId += 1;
  }

  private clearTimers(): void {
    if (this.debounceTimer !== null) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
  }

  private emit(): void {
    this.onStateChange?.(this.state);
  }

  private notifyToast(kind: ToastNoticePayload['kind'], text: string): void {
    this.onToast?.({ kind, text });
  }

  private isCurrentSession(sessionId: number, uid: string): boolean {
    return (
      this.sessionId === sessionId &&
      this.state.activeUid === uid &&
      !this.state.isLocalPreview
    );
  }

  public async handleAuthChange(nextUid: string | null): Promise<void> {
    // Token refreshes re-emit the same authenticated UID — do not disrupt active session.
    if (
      nextUid &&
      nextUid === this.state.activeUid &&
      !this.state.isLocalPreview &&
      this.state.screenMode !== 'title'
    ) {
      return;
    }

    this.clearTimers();
    this.sessionId += 1;
    const mySessionId = this.sessionId;
    this.mutationSeq = 0;
    this.confirmedSeq = 0;
    this.serverRevision = 1;
    this.pendingStateToSave = null;

    if (!nextUid) {
      if (this.isAutostartPreview) {
        this.state = {
          ...this.state,
          activeUid: null,
          isLocalPreview: true,
          screenMode: 'playing',
          saveStatus: 'local_preview',
          conflict: null,
          loadError: null,
          isResetting: false,
          localPersistFailed: false,
          cloudWriteVerified: false,
        };
        this.emit();
        return;
      }

      // Preserve any unconfirmed localStorage snapshot under the previous user's UID!
      this.state = {
        screenMode: 'title',
        isLocalPreview: false,
        activeUid: null,
        farmState: createInitialFarmState('local-preview', this.nowFn()),
        saveStatus: 'idle',
        loadError: null,
        conflict: null,
        lastSavedAtMs: null,
        isResetting: false,
        localPersistFailed: false,
        cloudWriteVerified: false,
      };
      this.emit();
      return;
    }

    this.state = {
      screenMode: 'loading_cloud',
      isLocalPreview: false,
      activeUid: nextUid,
      farmState: createInitialFarmState(nextUid, this.nowFn()),
      saveStatus: 'loading',
      loadError: null,
      conflict: null,
      lastSavedAtMs: null,
      isResetting: false,
      localPersistFailed: false,
      cloudWriteVerified: false,
    };
    this.emit();

    await this.loadCloudFarmForSession(mySessionId, nextUid);
  }

  public async retryLoad(): Promise<void> {
    const activeUid = this.state.activeUid;
    if (!activeUid || this.state.isLocalPreview) return;
    this.clearTimers();
    this.sessionId += 1;
    const mySessionId = this.sessionId;
    this.mutationSeq = 0;
    this.confirmedSeq = 0;
    this.pendingStateToSave = null;
    this.state = {
      ...this.state,
      screenMode: 'loading_cloud',
      saveStatus: 'loading',
      loadError: null,
      conflict: null,
      isResetting: false,
      localPersistFailed: false,
    };
    this.emit();
    await this.loadCloudFarmForSession(mySessionId, activeUid);
  }

  private async loadCloudFarmForSession(sessionId: number, uid: string): Promise<void> {
    try {
      const conn = await this.cloud.testConnection();
      if (!this.isCurrentSession(sessionId, uid)) return;

      if (!conn.reachable) {
        throw new Error(
          conn.userMessageAr || 'تعذر الاتصال بخدمة Cloud Firestore. تحقق من اتصالك بالإنترنت.',
        );
      }

      const { resolution, createdInitial } = await this.cloud.loadOrCreateCloudFarm(uid);
      if (!this.isCurrentSession(sessionId, uid)) return;

      if (resolution.kind === 'use_server') {
        assertOwnerUidMatch(resolution.state, uid);
        const rescueCheck = evaluateRescueGrant(resolution.state);
        this.serverRevision = resolution.state.revision;

        if (rescueCheck.granted) {
          assertOwnerUidMatch(rescueCheck.state, uid);
          this.mutationSeq += 1;
          const seq = this.mutationSeq;
          const persistRes = this.storage.savePending({
            uid,
            baseRevision: this.serverRevision,
            state: rescueCheck.state,
            queuedAtMs: this.nowFn(),
            seq,
          });
          this.pendingStateToSave = { seq, state: rescueCheck.state };
          this.state = {
            ...this.state,
            farmState: rescueCheck.state,
            lastSavedAtMs: resolution.state.updatedAtMs,
            loadError: null,
            conflict: null,
            screenMode: 'playing',
            localPersistFailed: !persistRes.ok,
            cloudWriteVerified: createdInitial,
            saveStatus: !persistRes.ok
              ? 'error'
              : this.isOnlineFn()
                ? 'saving'
                : 'pending_offline',
          };
          this.emit();
          this.notifyToast('info', 'تم منحك 3 بذور قمح إنقاذية لتتمكن من مواصلة الزراعة!');
          if (!persistRes.ok) {
            this.notifyToast(
              'warning',
              'تعذر حفظ النسخة المحلية احتياطيًا في المتصفح؛ نحاول الرفع للسحابة مباشرة.',
            );
          }
          await this.flushExplicitSave(sessionId, uid);
          return;
        }

        this.state = {
          ...this.state,
          farmState: rescueCheck.state,
          lastSavedAtMs: resolution.state.updatedAtMs,
          loadError: null,
          conflict: null,
          screenMode: 'playing',
          saveStatus: 'saved',
          localPersistFailed: false,
          cloudWriteVerified: createdInitial,
        };
        this.emit();
        if (createdInitial) {
          this.notifyToast('success', 'أهلًا بك في مزرعتك الجديدة! تم إنشاء حفظك السحابي.');
        }
        return;
      }

      if (resolution.kind === 'retry_pending') {
        assertOwnerUidMatch(resolution.state, uid);
        this.serverRevision = resolution.baseRevision;
        const seq = Math.max(this.mutationSeq + 1, resolution.pendingSeq ?? 1);
        this.mutationSeq = seq;
        this.confirmedSeq = 0;
        this.pendingStateToSave = { seq, state: resolution.state };
        this.state = {
          ...this.state,
          farmState: resolution.state,
          loadError: null,
          conflict: null,
          screenMode: 'playing',
          localPersistFailed: false,
          cloudWriteVerified: false,
          saveStatus: this.isOnlineFn() ? 'saving' : 'pending_offline',
        };
        this.emit();
        this.notifyToast('info', 'تم العثور على تعديلات محلية غير متزامنة، جارٍ رفعها الآن...');
        await this.flushExplicitSave(sessionId, uid);
        return;
      }

      if (resolution.kind === 'conflict') {
        assertOwnerUidMatch(resolution.serverState, uid);
        assertOwnerUidMatch(resolution.pendingState, uid);
        this.serverRevision = resolution.serverState.revision;
        this.pendingStateToSave = null;
        this.state = {
          ...this.state,
          farmState: resolution.pendingState,
          loadError: null,
          conflict: {
            serverState: resolution.serverState,
            localState: resolution.pendingState,
          },
          screenMode: 'playing',
          saveStatus: 'conflict',
        };
        this.emit();
      }
    } catch (error) {
      if (!this.isCurrentSession(sessionId, uid)) return;
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
      this.state = {
        ...this.state,
        loadError: userMessage,
        saveStatus: 'error',
      };
      this.emit();
    }
  }

  public recordGameplayMutation(nextState: FarmState): void {
    if (!this.canAcceptGameplayAction()) return;

    if (this.state.isLocalPreview || !this.state.activeUid) {
      this.state = {
        ...this.state,
        farmState: nextState,
        saveStatus: 'local_preview',
      };
      this.emit();
      return;
    }

    const uid = this.state.activeUid;
    assertOwnerUidMatch(nextState, uid);

    this.mutationSeq += 1;
    const seq = this.mutationSeq;
    const persistRes = this.storage.savePending({
      uid,
      baseRevision: this.serverRevision,
      state: nextState,
      queuedAtMs: this.nowFn(),
      seq,
    });

    this.pendingStateToSave = { seq, state: nextState };
    const online = this.isOnlineFn();

    if (!persistRes.ok) {
      this.state = {
        ...this.state,
        farmState: nextState,
        localPersistFailed: true,
        saveStatus: 'error',
      };
      this.emit();
      this.notifyToast(
        'warning',
        'تعذر حفظ التعديلات محليًا في المتصفح؛ لا تغلق الصفحة قبل نجاح الحفظ السحابي.',
      );
      if (online) {
        this.scheduleDebounce(this.sessionId, uid);
      }
      return;
    }

    this.state = {
      ...this.state,
      farmState: nextState,
      localPersistFailed: false,
      saveStatus: online ? 'saving' : 'pending_offline',
    };
    this.emit();

    if (online) {
      this.scheduleDebounce(this.sessionId, uid);
    }
  }

  private scheduleDebounce(sessionId: number, uid: string): void {
    this.clearTimers();
    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = null;
      void this.flushExplicitSave(sessionId, uid);
    }, this.debounceMs);
  }

  public async flushNow(): Promise<void> {
    if (!this.state.activeUid || this.state.isLocalPreview) return;
    this.clearTimers();
    await this.flushExplicitSave(this.sessionId, this.state.activeUid);
  }

  public async handleBrowserOnline(): Promise<void> {
    if (
      !this.state.activeUid ||
      this.state.isLocalPreview ||
      this.state.conflict ||
      this.state.isResetting
    ) {
      return;
    }
    if (
      this.state.saveStatus === 'pending_offline' ||
      this.state.saveStatus === 'error' ||
      this.pendingStateToSave !== null
    ) {
      await this.flushExplicitSave(this.sessionId, this.state.activeUid);
    }
  }

  private async flushExplicitSave(sessionId: number, uid: string): Promise<void> {
    if (!this.isCurrentSession(sessionId, uid)) return;
    if (this.state.conflict || this.state.isResetting) return;

    // Serialize cloud writes sequentially per session so edits during flight never race on expectedRevision.
    if (this.inFlightSave) {
      return;
    }

    const pending = this.pendingStateToSave;
    if (!pending) return;

    if (!this.isOnlineFn()) {
      this.state = {
        ...this.state,
        saveStatus: this.state.localPersistFailed ? 'error' : 'pending_offline',
      };
      this.emit();
      return;
    }

    const seqAtStart = pending.seq;
    const snapshotToSave = pending.state;

    try {
      assertOwnerUidMatch(snapshotToSave, uid);
    } catch {
      this.state = {
        ...this.state,
        saveStatus: 'error',
      };
      this.emit();
      this.notifyToast('error', 'تم إيقاف الحفظ لتعارض هوية المزرعة مع الحساب الحالي.');
      return;
    }

    this.state = {
      ...this.state,
      saveStatus: 'saving',
    };
    this.emit();

    const expectedRevisionAtStart = this.serverRevision;
    let shouldFlushNext = false;
    let runPromise!: Promise<void>;

    runPromise = (async () => {
      try {
        let saved: FarmState;
        if (typeof this.cloud.flushCloudSave === 'function') {
          saved = await this.cloud.flushCloudSave(
            uid,
            snapshotToSave,
            expectedRevisionAtStart,
            seqAtStart,
          );
        } else {
          saved = await this.cloud.saveCloudFarmWithRevisionCheck(
            uid,
            snapshotToSave,
            expectedRevisionAtStart,
          );
          this.storage.clearIfMatching(uid, seqAtStart);
        }

        if (!this.isCurrentSession(sessionId, uid)) {
          return;
        }

        // If a farm reset started while this earlier write was in-flight, NEVER revert reset state or clear reset's pending edit!
        if (this.state.isResetting) {
          this.serverRevision = saved.revision;
          return;
        }

        this.confirmedSeq = Math.max(this.confirmedSeq, seqAtStart);
        this.serverRevision = saved.revision;

        if (this.mutationSeq > seqAtStart && this.pendingStateToSave) {
          // Newer edit arrived during in-flight write: preserve it, rebase its baseRevision, never show 'saved' yet!
          const rebaseRes = this.storage.rebasePending(uid, seqAtStart, saved.revision);
          const rebasedPendingState: FarmState = {
            ...this.pendingStateToSave.state,
            revision: saved.revision,
          };
          this.pendingStateToSave = {
            seq: this.pendingStateToSave.seq,
            state: rebasedPendingState,
          };
          const persistFailed = this.state.localPersistFailed || !rebaseRes.ok;

          this.state = {
            ...this.state,
            farmState: {
              ...this.state.farmState,
              revision: saved.revision,
              updatedAtMs: saved.updatedAtMs,
            },
            lastSavedAtMs: saved.updatedAtMs,
            cloudWriteVerified: true,
            localPersistFailed: persistFailed,
            saveStatus: persistFailed
              ? 'error'
              : this.isOnlineFn()
                ? 'saving'
                : 'pending_offline',
          };
          this.emit();

          if (this.isOnlineFn()) {
            shouldFlushNext = true;
          }
          return;
        }

        // No newer unconfirmed mutations remain
        this.pendingStateToSave = null;
        this.state = {
          ...this.state,
          farmState: {
            ...this.state.farmState,
            revision: saved.revision,
            updatedAtMs: saved.updatedAtMs,
          },
          lastSavedAtMs: saved.updatedAtMs,
          cloudWriteVerified: true,
          localPersistFailed: false,
          saveStatus: 'saved',
        };
        this.emit();
      } catch (error) {
        if (!this.isCurrentSession(sessionId, uid)) {
          return;
        }

        if (error instanceof RevisionConflictError) {
          this.state = {
            ...this.state,
            saveStatus: 'conflict',
            conflict: {
              serverState: error.serverState,
              localState: this.pendingStateToSave?.state ?? snapshotToSave,
            },
          };
          this.emit();
          this.notifyToast(
            'warning',
            'تم اكتشاف نسخة أحدث من مزرعتك على الخادم. أوقفنا الحفظ القديم لحماية تقدمك.',
          );
          return;
        }

        if (this.state.isResetting) {
          return;
        }

        const offline = !this.isOnlineFn();
        const nextStatus: SaveStatus =
          offline && !this.state.localPersistFailed ? 'pending_offline' : 'error';
        this.state = {
          ...this.state,
          saveStatus: nextStatus,
        };
        this.emit();

        if (offline && !this.state.localPersistFailed) {
          this.notifyToast(
            'error',
            'أنت غير متصل حاليًا؛ تم حفظ التعديلات محليًا وستتم المزامنة عند عودة الاتصال.',
          );
        } else if (this.state.localPersistFailed) {
          this.notifyToast(
            'error',
            'تعذر الحفظ إلى السحابة وفشل النسخ الاحتياطي المحلي في المتصفح.',
          );
        } else {
          this.notifyToast(
            'error',
            'تعذر الحفظ إلى السحابة. التغييرات محفوظة محليًا ويمكنك إعادة المحاولة.',
          );
        }
      } finally {
        if (this.inFlightSave?.promise === runPromise) {
          this.inFlightSave = null;
        }
      }
    })();

    this.inFlightSave = {
      seq: seqAtStart,
      sessionId,
      uid,
      promise: runPromise,
    };

    await runPromise;

    if (
      shouldFlushNext &&
      this.isCurrentSession(sessionId, uid) &&
      !this.state.conflict &&
      !this.state.isResetting &&
      this.isOnlineFn()
    ) {
      if (this.followUpDelayMs > 0) {
        this.clearTimers();
        this.debounceTimer = setTimeout(() => {
          this.debounceTimer = null;
          void this.flushExplicitSave(sessionId, uid);
        }, this.followUpDelayMs);
      } else {
        await this.flushExplicitSave(sessionId, uid);
      }
    }
  }

  public async resolveConflictUseServer(): Promise<void> {
    const uid = this.state.activeUid;
    if (!uid || this.state.isLocalPreview) return;
    const mySessionId = this.sessionId;
    this.clearTimers();

    if (this.inFlightSave && this.inFlightSave.sessionId === mySessionId) {
      try {
        await this.inFlightSave.promise;
      } catch {
        // Ignore prior error
      }
      if (!this.isCurrentSession(mySessionId, uid)) return;
    }

    this.state = {
      ...this.state,
      saveStatus: 'loading',
    };
    this.emit();

    try {
      const latestServer = await this.cloud.fetchServerFarm(uid);
      if (!this.isCurrentSession(mySessionId, uid)) return;

      if (latestServer) {
        assertOwnerUidMatch(latestServer, uid);
        this.storage.clearPending(uid);
        this.pendingStateToSave = null;
        this.serverRevision = latestServer.revision;
        this.confirmedSeq = this.mutationSeq;
        this.state = {
          ...this.state,
          farmState: latestServer,
          lastSavedAtMs: latestServer.updatedAtMs,
          conflict: null,
          localPersistFailed: false,
          cloudWriteVerified: true,
          saveStatus: 'saved',
        };
        this.emit();
        this.notifyToast('success', 'تم تحميل أحدث نسخة محفوظة من السحابة بنجاح.');
      }
    } catch {
      if (!this.isCurrentSession(mySessionId, uid)) return;
      this.state = {
        ...this.state,
        saveStatus: 'error',
      };
      this.emit();
      this.notifyToast('error', 'تعذر تحميل النسخة الأحدث. تحقق من الاتصال وحاول مجددًا.');
    }
  }

  public async confirmNewFarm(): Promise<void> {
    if (!this.canAcceptGameplayAction()) return;

    this.clearTimers();
    const fresh = resetFarmState(this.state.farmState, this.nowFn());

    if (this.state.isLocalPreview || !this.state.activeUid) {
      this.state = {
        ...this.state,
        farmState: fresh,
        saveStatus: 'local_preview',
      };
      this.emit();
      this.notifyToast('success', 'تمت إعادة بدء المزرعة بنجاح.');
      return;
    }

    const uid = this.state.activeUid;
    const mySessionId = this.sessionId;
    assertOwnerUidMatch(fresh, uid);

    this.mutationSeq += 1;
    const resetSeq = this.mutationSeq;
    const persistRes = this.storage.savePending({
      uid,
      baseRevision: this.serverRevision,
      state: fresh,
      queuedAtMs: this.nowFn(),
      seq: resetSeq,
    });
    this.pendingStateToSave = { seq: resetSeq, state: fresh };

    this.state = {
      ...this.state,
      farmState: fresh,
      isResetting: true,
      localPersistFailed: !persistRes.ok,
      saveStatus: 'saving',
    };
    this.emit();

    // Wait for any in-flight save in this session to finish first so revisions stay linear and old writes never revert reset.
    if (this.inFlightSave && this.inFlightSave.sessionId === mySessionId) {
      try {
        await this.inFlightSave.promise;
      } catch {
        // Handled below
      }
      if (!this.isCurrentSession(mySessionId, uid)) return;
      if (this.state.conflict) {
        this.state = {
          ...this.state,
          isResetting: false,
        };
        this.emit();
        return;
      }
    }

    if (persistRes.ok) {
      const rebaseRes = this.storage.rebasePending(uid, resetSeq - 1, this.serverRevision);
      if (!rebaseRes.ok) {
        this.state = { ...this.state, localPersistFailed: true };
      }
    }

    try {
      const saved = await this.cloud.saveCloudFarmWithRevisionCheck(
        uid,
        fresh,
        this.serverRevision,
      );
      this.storage.clearIfMatching(uid, resetSeq);

      if (!this.isCurrentSession(mySessionId, uid)) return;

      this.confirmedSeq = Math.max(this.confirmedSeq, resetSeq);
      this.serverRevision = saved.revision;
      this.pendingStateToSave = null;
      this.state = {
        ...this.state,
        farmState: saved,
        lastSavedAtMs: saved.updatedAtMs,
        isResetting: false,
        localPersistFailed: false,
        cloudWriteVerified: true,
        saveStatus: 'saved',
      };
      this.emit();
      this.notifyToast('success', 'تمت إعادة بدء مزرعتك وحفظها في السحابة.');
    } catch (error) {
      if (!this.isCurrentSession(mySessionId, uid)) return;

      if (error instanceof RevisionConflictError) {
        this.state = {
          ...this.state,
          isResetting: false,
          saveStatus: 'conflict',
          conflict: {
            serverState: error.serverState,
            localState: fresh,
          },
        };
        this.emit();
      } else {
        const offline = !this.isOnlineFn();
        this.state = {
          ...this.state,
          isResetting: false,
          saveStatus: offline && !this.state.localPersistFailed ? 'pending_offline' : 'error',
        };
        this.emit();
        this.notifyToast(
          'error',
          this.state.localPersistFailed
            ? 'أُعيد ضبط المزرعة في الجلسة الحالية، وتعذر الحفظ السحابي والمحلي.'
            : 'أُعيد ضبط المزرعة محليًا، وتعذر الرفع للسحابة حاليًا.',
        );
      }
    }
  }
}
