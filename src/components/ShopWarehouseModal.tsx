import { X } from 'lucide-react';
import { CROP_DEFINITIONS, CROP_IDS, type CropId } from '../content/crops';
import type { FarmState } from '../game/types';
import { CarrotIconSvg, CoinSvg, WheatIconSvg } from './FarmIcons';

interface ShopWarehouseModalProps {
  tab: 'shop' | 'warehouse' | null;
  farmState: FarmState;
  onChangeTab: (tab: 'shop' | 'warehouse') => void;
  onClose: () => void;
  onBuySeeds: (cropId: CropId, quantity: number) => void;
  onSellCrops: (cropId: CropId, quantity: number) => void;
}

export function ShopWarehouseModal({
  tab,
  farmState,
  onChangeTab,
  onClose,
  onBuySeeds,
  onSellCrops,
}: ShopWarehouseModalProps) {
  if (!tab) return null;

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/45 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={tab === 'shop' ? 'متجر البذور' : 'المستودع والبيع'}
    >
      <div className="w-full max-w-lg rounded-2xl border-2 border-[#b99663] bg-[#fbf6ea] p-5 shadow-2xl">
        <div className="flex items-center justify-between border-b border-[#e2cfa9] pb-3">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => onChangeTab('shop')}
              className={`cursor-pointer rounded-xl px-4 py-2 text-sm font-black transition-colors ${
                tab === 'shop'
                  ? 'bg-[#f59e0b] text-[#2c1806]'
                  : 'bg-[#efe4cc] text-[#6a4e2f] hover:bg-[#e5d5b3]'
              }`}
            >
              متجر البذور
            </button>
            <button
              type="button"
              onClick={() => onChangeTab('warehouse')}
              className={`cursor-pointer rounded-xl px-4 py-2 text-sm font-black transition-colors ${
                tab === 'warehouse'
                  ? 'bg-[#8d613a] text-white'
                  : 'bg-[#efe4cc] text-[#6a4e2f] hover:bg-[#e5d5b3]'
              }`}
            >
              المستودع والبيع
            </button>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 rounded-xl bg-[#fef3c7] px-2.5 py-1 text-sm font-black text-[#78350f]">
              <CoinSvg className="h-4 w-4" />
              <span className="tabular-nums">{farmState.coins}</span>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="إغلاق النافذة"
              className="cursor-pointer rounded-xl p-1.5 text-[#6a4e2f] hover:bg-[#efe4cc]"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {tab === 'shop' ? (
          <div className="mt-4 space-y-3" data-testid="seed-shop-panel">
            {CROP_IDS.map((cropId) => {
              const def = CROP_DEFINITIONS[cropId];
              const ownedSeeds = farmState.seeds[cropId];
              const canBuy1 = farmState.coins >= def.seedCost;
              const canBuy5 = farmState.coins >= def.seedCost * 5;

              return (
                <div
                  key={cropId}
                  className="flex flex-col justify-between gap-3 rounded-xl border border-[#dec89f] bg-[#fffcf4] p-3.5 sm:flex-row sm:items-center"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#fef3c7]">
                      {cropId === 'wheat' ? (
                        <WheatIconSvg className="h-7 w-7" />
                      ) : (
                        <CarrotIconSvg className="h-7 w-7" />
                      )}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-base font-black text-[#3d2814]">
                          {def.seedNameAr}
                        </span>
                        <span className="tabular-nums rounded-md bg-[#dcfce7] px-2 py-0.5 text-xs font-extrabold text-[#166534]">
                          متاح: {ownedSeeds}
                        </span>
                      </div>
                      <div className="mt-1 text-xs font-bold text-[#6e5232]">
                        الكلفة: <span className="tabular-nums">{def.seedCost}</span> عملة · النمو:{' '}
                        <span className="tabular-nums">{def.growthSeconds}</span> ث · البيع:{' '}
                        <span className="tabular-nums">{def.sellPrice}</span> عملة
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      data-testid={`buy-${cropId}-1`}
                      disabled={!canBuy1}
                      onClick={() => onBuySeeds(cropId, 1)}
                      className="cursor-pointer rounded-xl border border-[#b45309] bg-[#f59e0b] px-3 py-2 text-xs font-black text-[#2c1806] hover:bg-[#fbbf24] disabled:cursor-not-allowed disabled:opacity-45"
                    >
                      شراء 1 ({def.seedCost})
                    </button>
                    <button
                      type="button"
                      data-testid={`buy-${cropId}-5`}
                      disabled={!canBuy5}
                      onClick={() => onBuySeeds(cropId, 5)}
                      className="cursor-pointer rounded-xl border border-[#b45309] bg-[#fde68a] px-3 py-2 text-xs font-black text-[#451a03] hover:bg-[#fcd34d] disabled:cursor-not-allowed disabled:opacity-45"
                    >
                      شراء 5 ({def.seedCost * 5})
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="mt-4 space-y-3" data-testid="warehouse-panel">
            {CROP_IDS.map((cropId) => {
              const def = CROP_DEFINITIONS[cropId];
              const stored = farmState.crops[cropId];

              return (
                <div
                  key={cropId}
                  className="flex flex-col justify-between gap-3 rounded-xl border border-[#dec89f] bg-[#fffcf4] p-3.5 sm:flex-row sm:items-center"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#f3ead5]">
                      {cropId === 'wheat' ? (
                        <WheatIconSvg className="h-7 w-7" />
                      ) : (
                        <CarrotIconSvg className="h-7 w-7" />
                      )}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-base font-black text-[#3d2814]">{def.nameAr}</span>
                        <span className="tabular-nums rounded-md bg-[#fef3c7] px-2 py-0.5 text-xs font-extrabold text-[#92400e]">
                          بالمستودع: {stored}
                        </span>
                      </div>
                      <div className="mt-1 text-xs font-bold text-[#6e5232]">
                        سعر البيع للوحدة:{' '}
                        <span className="tabular-nums">{def.sellPrice}</span> عملة
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      data-testid={`sell-${cropId}-1`}
                      disabled={stored < 1}
                      onClick={() => onSellCrops(cropId, 1)}
                      className="cursor-pointer rounded-xl border border-[#166534] bg-[#22c55e] px-3 py-2 text-xs font-black text-[#052e16] hover:bg-[#4ade80] disabled:cursor-not-allowed disabled:opacity-45"
                    >
                      بيع 1 (+{def.sellPrice})
                    </button>
                    <button
                      type="button"
                      data-testid={`sell-${cropId}-all`}
                      disabled={stored < 1}
                      onClick={() => onSellCrops(cropId, stored)}
                      className="cursor-pointer rounded-xl border border-[#166534] bg-[#bbf7d0] px-3 py-2 text-xs font-black text-[#14532d] hover:bg-[#86efac] disabled:cursor-not-allowed disabled:opacity-45"
                    >
                      بيع الكل ({stored * def.sellPrice})
                    </button>
                  </div>
                </div>
              );
            })}

            <div className="flex items-center justify-between rounded-xl bg-[#f3ead5] px-3.5 py-2.5 text-xs font-bold text-[#5c4327]">
              <span>إجمالي المزروعات: {farmState.stats.totalPlanted}</span>
              <span>إجمالي المحصود: {farmState.stats.totalHarvested}</span>
              <span>إجمالي المبيعات: {farmState.stats.totalRevenue} عملة</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
