import { useEffect } from 'react';
import { FarmCrestSvg } from './FarmIcons';

interface TitleScreenProps {
  authReady: boolean;
  onSignIn: () => void;
}

export function TitleScreen({ authReady, onSignIn }: TitleScreenProps) {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        if (authReady) {
          onSignIn();
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [authReady, onSignIn]);

  return (
    <div className="pointer-events-none fixed inset-0 z-20 flex flex-col justify-between p-5 sm:p-8">
      {/* Main Title Card anchored to calm top-right region leaving 3D farm centerpiece clear */}
      <div className="pointer-events-auto max-w-md rounded-2xl border-2 border-[#b99663] bg-[#fbf6ea]/95 p-6 shadow-2xl">
        <div className="flex items-center gap-4">
          <FarmCrestSvg className="h-16 w-16 shrink-0" />
          <div>
            <h1 className="text-2xl font-black tracking-tight text-[#3d2814] sm:text-3xl">
              مزرعتي — رحلة الازدهار
            </h1>
            <p className="mt-1 text-sm font-semibold text-[#755737]">
              ازرع القمح والجزر، اسقِ حقولك، واحصد ثمار مزرعتك ثلاثية الأبعاد.
            </p>
          </div>
        </div>

        <div className="mt-5 flex flex-col gap-3">
          <button
            type="button"
            data-start="true"
            disabled={!authReady}
            onClick={onSignIn}
            className="flex w-full cursor-pointer items-center justify-center gap-3 rounded-xl border-2 border-[#78350f] bg-[#f59e0b] px-5 py-3.5 text-base font-extrabold text-[#2c1806] shadow-md transition-transform hover:bg-[#fbbf24] active:scale-[0.98] disabled:cursor-wait disabled:opacity-60"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5 shrink-0" aria-hidden="true">
              <path
                fill="#2c1806"
                d="M21.35 11.1h-9.17v2.73h6.51c-.33 3.81-3.5 5.44-6.5 5.44C8.36 19.27 5 16.25 5 12c0-4.1 3.2-7.27 7.2-7.27 3.09 0 4.9 1.97 4.9 1.97L19 4.72S16.56 2 12.1 2C6.42 2 2.03 6.8 2.03 12c0 5.05 4.13 10 10.22 10 5.35 0 9.25-3.67 9.25-9.09 0-1.15-.15-1.81-.15-1.81z"
              />
            </svg>
            <span>{authReady ? 'تسجيل الدخول بحساب Google' : 'جارٍ تهيئة الاتصال...'}</span>
          </button>

          <p className="text-center text-xs font-medium text-[#6f5538]">
            يُحفظ تقدم مزرعتك سحابيًا بحساب Google الخاص بك لاسترجاعه في أي وقت.
          </p>
        </div>
      </div>

      {/* Single flat control hint at bottom safe area */}
      <div className="flex justify-center">
        <div className="rounded-xl border border-[#c7ab7c] bg-[#fbf6ea]/92 px-4 py-2 text-xs font-bold text-[#4b351f] shadow-md sm:text-sm">
          انقر على قطعة الأرض للتفاعل · اسحب لتدوير الكاميرا · مرّر العجلة للتقريب
        </div>
      </div>
    </div>
  );
}
