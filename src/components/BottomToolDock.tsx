import { ShoppingBag, Warehouse } from 'lucide-react';
import type { FarmState, ToolId } from '../game/types';
import {
  CarrotIconSvg,
  HarvestIconSvg,
  WateringIconSvg,
  WheatIconSvg,
} from './FarmIcons';

interface BottomToolDockProps {
  farmState: FarmState;
  activeTool: ToolId;
  onSelectTool: (tool: ToolId) => void;
  onOpenShop: () => void;
  onOpenWarehouse: () => void;
}

export function BottomToolDock({
  farmState,
  activeTool,
  onSelectTool,
  onOpenShop,
  onOpenWarehouse,
}: BottomToolDockProps) {
  const totalStoredCrops = farmState.crops.wheat + farmState.crops.carrot;

  const tools: Array<{
    id: ToolId;
    label: string;
    badge?: number;
    shortcut: string;
    icon: React.ReactNode;
  }> = [
    {
      id: 'seed_wheat',
      label: 'القمح',
      badge: farmState.seeds.wheat,
      shortcut: '1',
      icon: <WheatIconSvg className="h-6 w-6" />,
    },
    {
      id: 'seed_carrot',
      label: 'الجزر',
      badge: farmState.seeds.carrot,
      shortcut: '2',
      icon: <CarrotIconSvg className="h-6 w-6" />,
    },
    {
      id: 'water',
      label: 'ري',
      shortcut: '3',
      icon: <WateringIconSvg className="h-6 w-6" />,
    },
    {
      id: 'harvest',
      label: 'حصاد',
      shortcut: '4',
      icon: <HarvestIconSvg className="h-6 w-6" />,
    },
  ];

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-3 z-20 flex justify-center px-2 sm:bottom-4">
      <div className="pointer-events-auto flex max-w-full flex-wrap items-center justify-center gap-1.5 rounded-2xl border-2 border-[#b99663] bg-[#fbf6ea]/95 p-1.5 shadow-2xl sm:gap-2 sm:p-2">
        {tools.map((tool) => {
          const isActive = activeTool === tool.id;
          return (
            <button
              key={tool.id}
              type="button"
              data-testid={`tool-${tool.id}`}
              aria-pressed={isActive}
              onClick={() => onSelectTool(tool.id)}
              className={`relative flex min-w-[66px] cursor-pointer flex-col items-center gap-0.5 rounded-xl border-2 px-2.5 py-1.5 transition-all sm:min-w-[78px] sm:px-3 ${
                isActive
                  ? 'border-[#b45309] bg-[#fde68a] shadow-inner'
                  : 'border-transparent bg-[#f4ebd6] hover:border-[#d6ba8b] hover:bg-[#faf2df]'
              }`}
            >
              <span className="absolute left-1.5 top-1 text-[10px] font-bold text-[#8a6d4b]">
                {tool.shortcut}
              </span>
              {tool.icon}
              <span className="text-xs font-extrabold text-[#3d2814]">{tool.label}</span>
              {typeof tool.badge === 'number' && (
                <span
                  className={`tabular-nums rounded-md px-1.5 text-[11px] font-black ${
                    tool.badge > 0
                      ? 'bg-[#dcfce7] text-[#166534]'
                      : 'bg-[#fee2e2] text-[#991b1b]'
                  }`}
                >
                  {tool.badge}
                </span>
              )}
            </button>
          );
        })}

        <div className="mx-0.5 hidden h-10 w-[2px] bg-[#dfc79e] sm:block" />

        <button
          type="button"
          data-testid="open-shop-btn"
          onClick={onOpenShop}
          className="flex min-w-[78px] cursor-pointer flex-col items-center gap-0.5 rounded-xl border-2 border-[#8c6239] bg-[#f59e0b] px-3 py-1.5 text-[#2c1806] shadow-sm hover:bg-[#fbbf24]"
        >
          <ShoppingBag className="h-5 w-5" />
          <span className="text-xs font-black">متجر البذور</span>
        </button>

        <button
          type="button"
          data-testid="open-warehouse-btn"
          onClick={onOpenWarehouse}
          className="relative flex min-w-[78px] cursor-pointer flex-col items-center gap-0.5 rounded-xl border-2 border-[#6e5032] bg-[#8d613a] px-3 py-1.5 text-[#fffaf0] shadow-sm hover:bg-[#a17146]"
        >
          <Warehouse className="h-5 w-5" />
          <span className="text-xs font-black">المستودع</span>
          {totalStoredCrops > 0 && (
            <span className="tabular-nums absolute -top-2 left-1 rounded-md border border-[#78350f] bg-[#fde047] px-1.5 text-[11px] font-black text-[#3b250e]">
              {totalStoredCrops}
            </span>
          )}
        </button>
      </div>
    </div>
  );
}
