import {
  CheckCircle2,
  Cloud,
  CloudAlert,
  CloudOff,
  LogOut,
  RefreshCw,
  RotateCcw,
  Sparkles,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { computeLevelFromXp, getIntroGoalProgress } from '../game/rules';
import type { FarmState, SaveStatus } from '../game/types';
import { CoinSvg } from './FarmIcons';

interface TopHudProps {
  farmState: FarmState;
  saveStatus: SaveStatus;
  isLocalPreview: boolean;
  isResetting?: boolean;
  localPersistFailed?: boolean;
  hasConflict?: boolean;
  userEmail: string | null;
  muted: boolean;
  lastSavedAtMs: number | null;
  onToggleMute: () => void;
  onResetCamera: () => void;
  onRequestNewFarm: () => void;
  onRetrySave: () => void;
  onSignOut: () => void;
}

function renderSaveStatusLabel(
  status: SaveStatus,
  localPersistFailed = false,
): {
  label: string;
  tone: string;
  icon: 'saved' | 'saving' | 'offline' | 'error';
} {
  switch (status) {
    case 'saving':
      return { label: 'جارٍ الحفظ', tone: 'bg-[#fef3c7] text-[#92400e] border-[#f59e0b]', icon: 'saving' };
    case 'saved':
      return { label: 'تم الحفظ', tone: 'bg-[#dcfce7] text-[#166534] border-[#4ade80]', icon: 'saved' };
    case 'pending_offline':
      return {
        label: 'محفوظ محليًا (بانتظار الاتصال)',
        tone: 'bg-[#ffedd5] text-[#9a3412] border-[#fb923c]',
        icon: 'offline',
      };
    case 'conflict':
      return {
        label: 'تعارض في الحفظ',
        tone: 'bg-[#fee2e2] text-[#991b1b] border-[#f87171]',
        icon: 'error',
      };
    case 'error':
      return {
        label: localPersistFailed ? 'تعذر الحفظ المحلي والسحابي' : 'تعذر الحفظ',
        tone: 'bg-[#fee2e2] text-[#991b1b] border-[#f87171]',
        icon: 'error',
      };
    case 'local_preview':
      return {
        label: 'معاينة محلية (بدون Firebase)',
        tone: 'bg-[#e0f2fe] text-[#075985] border-[#38bdf8]',
        icon: 'offline',
      };
    case 'loading':
      return { label: 'جارٍ التحميل...', tone: 'bg-[#fef3c7] text-[#92400e] border-[#f59e0b]', icon: 'saving' };
    default:
      return { label: 'جاهز', tone: 'bg-[#f3f4f6] text-[#374151] border-[#d1d5db]', icon: 'saved' };
  }
}

export function TopHud({
  farmState,
  saveStatus,
  isLocalPreview,
  isResetting = false,
  localPersistFailed = false,
  hasConflict = false,
  userEmail,
  muted,
  lastSavedAtMs,
  onToggleMute,
  onResetCamera,
  onRequestNewFarm,
  onRetrySave,
  onSignOut,
}: TopHudProps) {
  const levelInfo = computeLevelFromXp(farmState.xp);
  const goal = getIntroGoalProgress(farmState);
  const statusUi = renderSaveStatusLabel(saveStatus, localPersistFailed);

  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-20 flex flex-wrap items-start justify-between gap-2 p-2.5 sm:p-4">
      {/* Right cluster (RTL start): Coins, Level/XP, Save Status & Intro Goal */}
      <div className="pointer-events-auto flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          {/* Coins Badge */}
          <div
            className="flex items-center gap-2 rounded-xl border-2 border-[#b8893a] bg-[#fbf6ea]/95 px-3 py-1.5 shadow-md"
            data-testid="hud-coins"
          >
            <CoinSvg className="h-6 w-6 shrink-0" />
            <div className="leading-tight">
              <div className="text-[10px] font-bold text-[#78572d]">العملات</div>
              <div className="tabular-nums text-base font-black text-[#3b250e] sm:text-lg">
                {farmState.coins}
              </div>
            </div>
          </div>

          {/* Level & XP Badge */}
          <div
            className="flex items-center gap-2.5 rounded-xl border-2 border-[#7b9a47] bg-[#fbf6ea]/95 px-3 py-1.5 shadow-md"
            data-testid="hud-level"
          >
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#65a30d] text-xs font-black text-white">
              <span className="tabular-nums">{levelInfo.level}</span>
            </div>
            <div className="min-w-[88px] leading-tight">
              <div className="flex items-center justify-between gap-2 text-[11px] font-bold text-[#4c5e28]">
                <span>المستوى {levelInfo.level}</span>
                <span className="tabular-nums text-[#657b36]">
                  {levelInfo.currentLevelXp}/{levelInfo.xpForNextLevel}
                </span>
              </div>
              <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-[#e2e8ce]">
                <div
                  className="h-full bg-[#65a30d] transition-all duration-300"
                  style={{ width: `${levelInfo.progressPercent}%` }}
                />
              </div>
            </div>
          </div>

          {/* Save Status Indicator */}
          <div
            className={`flex items-center gap-1.5 rounded-xl border px-2.5 py-1.5 text-xs font-bold shadow-sm ${statusUi.tone}`}
            data-testid="hud-save-status"
            title={
              lastSavedAtMs
                ? `آخر حفظ مؤكد: ${new Date(lastSavedAtMs).toLocaleTimeString('ar-EG')}`
                : undefined
            }
          >
            {statusUi.icon === 'saving' && <RefreshCw className="h-3.5 w-3.5 animate-spin" />}
            {statusUi.icon === 'saved' && <Cloud className="h-3.5 w-3.5" />}
            {statusUi.icon === 'offline' && <CloudOff className="h-3.5 w-3.5" />}
            {statusUi.icon === 'error' && <CloudAlert className="h-3.5 w-3.5" />}
            <span>{statusUi.label}</span>
            {(saveStatus === 'error' || saveStatus === 'pending_offline') && (
              <button
                type="button"
                onClick={onRetrySave}
                className="mr-1 cursor-pointer rounded-md bg-white/80 px-1.5 py-0.5 text-[11px] font-extrabold underline hover:bg-white"
              >
                إعادة المحاولة
              </button>
            )}
          </div>
        </div>

        {/* Intro Goal Card */}
        <div
          className="flex w-fit items-center gap-2.5 rounded-xl border-2 border-[#c8ab7b] bg-[#fbf6ea]/95 px-3 py-1.5 shadow-md"
          data-testid="intro-goal-card"
        >
          {goal.completed ? (
            <CheckCircle2 className="h-4 w-4 shrink-0 text-[#16a34a]" />
          ) : (
            <Sparkles className="h-4 w-4 shrink-0 text-[#d97706]" />
          )}
          <span className="text-xs font-extrabold text-[#3d2814]">{goal.titleAr}</span>
          <span
            className={`tabular-nums rounded-md px-2 py-0.5 text-xs font-black ${
              goal.completed
                ? 'bg-[#dcfce7] text-[#166534]'
                : 'bg-[#fef3c7] text-[#92400e]'
            }`}
          >
            {goal.current} / {goal.target}
          </span>
        </div>
      </div>

      {/* Left cluster (RTL end): Camera Reset, Sound, New Farm, Sign Out */}
      <div className="pointer-events-auto flex flex-wrap items-center gap-1.5 sm:gap-2">
        <button
          type="button"
          onClick={onResetCamera}
          aria-label="إعادة الكاميرا"
          className="flex cursor-pointer items-center gap-1.5 rounded-xl border-2 border-[#b99663] bg-[#fbf6ea]/95 px-2.5 py-1.5 text-xs font-extrabold text-[#3d2814] shadow-md hover:bg-[#fef3c7]"
        >
          <RotateCcw className="h-4 w-4" />
          <span className="hidden sm:inline">إعادة الكاميرا</span>
        </button>

        <button
          type="button"
          onClick={onToggleMute}
          aria-label={muted ? 'تشغيل الصوت' : 'كتم الصوت'}
          className="flex cursor-pointer items-center gap-1.5 rounded-xl border-2 border-[#b99663] bg-[#fbf6ea]/95 px-2.5 py-1.5 text-xs font-extrabold text-[#3d2814] shadow-md hover:bg-[#fef3c7]"
        >
          {muted ? <VolumeX className="h-4 w-4 text-[#b91c1c]" /> : <Volume2 className="h-4 w-4" />}
        </button>

        <button
          type="button"
          onClick={onRequestNewFarm}
          disabled={isResetting || hasConflict}
          className="cursor-pointer rounded-xl border-2 border-[#c27d58] bg-[#fff5eb]/95 px-2.5 py-1.5 text-xs font-extrabold text-[#7c2d12] shadow-md hover:bg-[#ffedd5] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isResetting ? 'جارٍ إعادة الضبط...' : 'مزرعة جديدة'}
        </button>

        {!isLocalPreview && userEmail && (
          <button
            type="button"
            onClick={onSignOut}
            aria-label="تسجيل الخروج"
            title={userEmail}
            className="flex cursor-pointer items-center gap-1.5 rounded-xl border-2 border-[#b99663] bg-[#fbf6ea]/95 px-2.5 py-1.5 text-xs font-extrabold text-[#4b351f] shadow-md hover:bg-[#fee2e2] hover:text-[#991b1b]"
          >
            <LogOut className="h-4 w-4" />
            <span className="hidden md:inline">خروج</span>
          </button>
        )}
      </div>
    </div>
  );
}
