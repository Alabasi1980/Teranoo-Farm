import { AlertTriangle, CloudDownload, RefreshCw, X } from 'lucide-react';
import type { ConflictState, ToastNotice } from '../hooks/useFarmGame';

export function CloudLoadOverlay({
  error,
  onRetry,
  onSignOut,
}: {
  error: string | null;
  onRetry: () => void;
  onSignOut: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#2c2116]/65 p-4">
      <div className="w-full max-w-md rounded-2xl border-2 border-[#b99663] bg-[#fbf6ea] p-6 text-center shadow-2xl">
        {error ? (
          <>
            <AlertTriangle className="mx-auto h-10 w-10 text-[#dc2626]" />
            <h2 className="mt-3 text-lg font-black text-[#3d2814]">تعذر تحميل حفظ المزرعة</h2>
            <p className="mt-2 text-sm font-medium text-[#6e5232]">{error}</p>
            <div className="mt-5 flex justify-center gap-3">
              <button
                type="button"
                onClick={onRetry}
                className="flex cursor-pointer items-center gap-2 rounded-xl border border-[#b45309] bg-[#f59e0b] px-4 py-2 text-sm font-black text-[#2c1806] hover:bg-[#fbbf24]"
              >
                <RefreshCw className="h-4 w-4" />
                إعادة المحاولة
              </button>
              <button
                type="button"
                onClick={onSignOut}
                className="cursor-pointer rounded-xl border border-[#b99663] bg-[#efe4cc] px-4 py-2 text-sm font-bold text-[#4b351f] hover:bg-[#e5d5b3]"
              >
                تبديل الحساب
              </button>
            </div>
          </>
        ) : (
          <>
            <RefreshCw className="mx-auto h-10 w-10 animate-spin text-[#b45309]" />
            <h2 className="mt-3 text-lg font-black text-[#3d2814]">جارٍ تحميل مزرعتك من السحابة...</h2>
            <p className="mt-1 text-xs font-semibold text-[#755737]">
              نسترجع تقدمك وأرضك قبل بدء اللعب لحماية بياناتك.
            </p>
          </>
        )}
      </div>
    </div>
  );
}

export function ConflictModal({
  conflict,
  onUseServer,
}: {
  conflict: ConflictState;
  onUseServer: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4"
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full max-w-md rounded-2xl border-2 border-[#dc2626] bg-[#fbf6ea] p-6 shadow-2xl">
        <div className="flex items-center gap-2.5 text-[#b91c1c]">
          <AlertTriangle className="h-6 w-6 shrink-0" />
          <h2 className="text-lg font-black">تعارض في حفظ المزرعة</h2>
        </div>

        <p className="mt-2.5 text-sm font-medium leading-relaxed text-[#4b351f]">
          يوجد تقدم أحدث محفوظ على السحابة من جلسة أخرى (المراجعة رقم{' '}
          <span className="tabular-nums font-black">{conflict.serverState.revision}</span>). لحماية
          مواردك ومنع تكرار العملات والمحاصيل، تم إيقاف الكتابة القديمة.
        </p>

        <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
          <div className="rounded-xl border border-[#86efac] bg-[#f0fdf4] p-3">
            <div className="font-black text-[#166534]">النسخة السحابية الأحدث</div>
            <div className="mt-1 font-bold text-[#14532d]">
              العملات: <span className="tabular-nums">{conflict.serverState.coins}</span>
            </div>
            <div className="font-bold text-[#14532d]">
              الخبرة: <span className="tabular-nums">{conflict.serverState.xp}</span>
            </div>
          </div>
          <div className="rounded-xl border border-[#fecaca] bg-[#fef2f2] p-3">
            <div className="font-black text-[#991b1b]">الجلسة المحلية المتوقفة</div>
            <div className="mt-1 font-bold text-[#7f1d1d]">
              العملات: <span className="tabular-nums">{conflict.localState.coins}</span>
            </div>
            <div className="font-bold text-[#7f1d1d]">
              الخبرة: <span className="tabular-nums">{conflict.localState.xp}</span>
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={onUseServer}
          className="mt-5 flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl border border-[#166534] bg-[#22c55e] px-4 py-2.5 text-sm font-black text-[#052e16] hover:bg-[#4ade80]"
        >
          <CloudDownload className="h-4 w-4" />
          تحميل النسخة الأحدث من السحابة
        </button>
      </div>
    </div>
  );
}

export function ConfirmResetModal({
  open,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full max-w-sm rounded-2xl border-2 border-[#c27d58] bg-[#fbf6ea] p-5 shadow-2xl">
        <h2 className="text-lg font-black text-[#3d2814]">بدء مزرعة جديدة؟</h2>
        <p className="mt-2 text-sm font-medium leading-relaxed text-[#5c4327]">
          سيُعاد ضبط العملات إلى 200، والخبرة إلى 0، وإفراغ قطع الأرض والمستودع وإعادة هدف الحصاد
          التمهيدي. هل أنت متأكد؟
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="cursor-pointer rounded-xl border border-[#b99663] bg-[#efe4cc] px-4 py-2 text-sm font-bold text-[#4b351f] hover:bg-[#e5d5b3]"
          >
            إلغاء
          </button>
          <button
            type="button"
            data-testid="confirm-new-farm-btn"
            onClick={onConfirm}
            className="cursor-pointer rounded-xl border border-[#991b1b] bg-[#dc2626] px-4 py-2 text-sm font-black text-white hover:bg-[#ef4444]"
          >
            نعم، ابدأ مزرعة جديدة
          </button>
        </div>
      </div>
    </div>
  );
}

export function ToastBanner({
  toast,
  onDismiss,
}: {
  toast: ToastNotice | null;
  onDismiss: () => void;
}) {
  if (!toast) return null;

  const tone =
    toast.kind === 'error'
      ? 'border-[#dc2626] bg-[#fef2f2] text-[#991b1b]'
      : toast.kind === 'warning'
        ? 'border-[#d97706] bg-[#fffbeb] text-[#92400e]'
        : toast.kind === 'info'
          ? 'border-[#0284c7] bg-[#f0f9ff] text-[#075985]'
          : 'border-[#16a34a] bg-[#f0fdf4] text-[#166534]';

  return (
    <div className="pointer-events-none fixed inset-x-0 top-48 z-30 flex justify-center px-4 sm:top-20">
      <div
        role="status"
        data-testid="toast-banner"
        className={`pointer-events-auto flex max-w-md items-center gap-3 rounded-xl border-2 px-4 py-2 text-xs font-extrabold shadow-lg sm:text-sm ${tone}`}
      >
        <span>{toast.text}</span>
        <button
          type="button"
          onClick={onDismiss}
          aria-label="إغلاق الإشعار"
          className="cursor-pointer rounded p-0.5 opacity-75 hover:opacity-100"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
