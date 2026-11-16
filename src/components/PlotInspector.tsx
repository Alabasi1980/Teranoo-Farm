import { Clock, X } from 'lucide-react';
import { CROP_DEFINITIONS } from '../content/crops';
import { getPlotDerivedInfo } from '../game/rules';
import type { FarmState, PlotId, ToolId } from '../game/types';

interface PlotInspectorProps {
  farmState: FarmState;
  selectedPlotId: PlotId | null;
  nowMs: number;
  onClose: () => void;
  onQuickAction: (plotId: PlotId, tool: ToolId) => void;
}

function formatRemainingTime(ms: number): string {
  const totalSec = Math.max(0, Math.ceil(ms / 1000));
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

export function PlotInspector({
  farmState,
  selectedPlotId,
  nowMs,
  onClose,
  onQuickAction,
}: PlotInspectorProps) {
  if (!selectedPlotId) return null;
  const plotIndex = farmState.plots.findIndex((p) => p.id === selectedPlotId);
  if (plotIndex === -1) return null;

  const plot = farmState.plots[plotIndex];
  const derived = getPlotDerivedInfo(plot, nowMs);
  const cropDef = derived.cropId ? CROP_DEFINITIONS[derived.cropId] : null;

  const statusText =
    derived.status === 'empty'
      ? 'فارغة — جاهزة للزراعة'
      : derived.status === 'planted_unwatered'
        ? 'مزروعة وتنتظر الري لبدء النمو'
        : derived.status === 'growing'
          ? 'قيد النمو بعد الري'
          : 'ناضجة وجاهزة للحصاد!';

  return (
    <div
      className="pointer-events-auto fixed bottom-40 right-3 z-20 w-[calc(100vw-24px)] max-w-xs rounded-2xl border-2 border-[#b99663] bg-[#fbf6ea]/95 p-3.5 shadow-xl sm:bottom-24 sm:right-5"
      data-testid="plot-inspector"
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-xs font-bold text-[#78572d]">قطعة أرض رقم {plotIndex + 1}</div>
          <div className="text-sm font-black text-[#3d2814]">
            {cropDef ? cropDef.nameAr : 'تربة مهيأة'}
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="إغلاق تفاصيل القطعة"
          className="cursor-pointer rounded-lg p-1 text-[#78572d] hover:bg-[#efe3ca]"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <p className="mt-1.5 text-xs font-bold text-[#5c4327]">{statusText}</p>

      {derived.status === 'growing' && (
        <div className="mt-2">
          <div className="flex items-center justify-between text-xs font-extrabold text-[#4b351f]">
            <span className="flex items-center gap-1">
              <Clock className="h-3.5 w-3.5 text-[#0284c7]" />
              الوقت المتبقي
            </span>
            <span className="tabular-nums text-[#0369a1]">
              {formatRemainingTime(derived.remainingMs)}
            </span>
          </div>
          <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-[#e6dcc6]">
            <div
              className="h-full bg-[#22c55e] transition-all duration-300"
              style={{ width: `${Math.round(derived.progress * 100)}%` }}
            />
          </div>
        </div>
      )}

      {derived.status === 'planted_unwatered' && cropDef && (
        <div className="mt-2 flex items-center justify-between rounded-lg bg-[#e0f2fe] px-2.5 py-1.5 text-xs font-bold text-[#075985]">
          <span>مدة النمو بعد الري</span>
          <span className="tabular-nums">{cropDef.growthSeconds} ثانية</span>
        </div>
      )}

      {/* Contextual quick action button */}
      <div className="mt-3 flex flex-wrap gap-2">
        {derived.status === 'empty' && (
          <>
            <button
              type="button"
              onClick={() => onQuickAction(plot.id, 'seed_wheat')}
              className="flex-1 cursor-pointer rounded-xl border border-[#b45309] bg-[#fde68a] px-2.5 py-1.5 text-xs font-black text-[#451a03] hover:bg-[#fcd34d]"
            >
              زراعة قمح ({farmState.seeds.wheat})
            </button>
            <button
              type="button"
              onClick={() => onQuickAction(plot.id, 'seed_carrot')}
              className="flex-1 cursor-pointer rounded-xl border border-[#c2410c] bg-[#fed7aa] px-2.5 py-1.5 text-xs font-black text-[#431407] hover:bg-[#fdba74]"
            >
              زراعة جزر ({farmState.seeds.carrot})
            </button>
          </>
        )}

        {derived.status === 'planted_unwatered' && (
          <button
            type="button"
            onClick={() => onQuickAction(plot.id, 'water')}
            className="w-full cursor-pointer rounded-xl border border-[#0369a1] bg-[#38bdf8] px-3 py-1.5 text-xs font-black text-[#082f49] hover:bg-[#7dd3fc]"
          >
            اسقِ القطعة الآن
          </button>
        )}

        {derived.status === 'ready' && (
          <button
            type="button"
            onClick={() => onQuickAction(plot.id, 'harvest')}
            className="w-full cursor-pointer rounded-xl border border-[#a16207] bg-[#facc15] px-3 py-1.5 text-xs font-black text-[#422006] hover:bg-[#fde047]"
          >
            احصد المحصول الآن
          </button>
        )}
      </div>
    </div>
  );
}
