import { useEffect, useState } from 'react';
import { BottomToolDock } from './components/BottomToolDock';
import {
  CloudLoadOverlay,
  ConfirmResetModal,
  ConflictModal,
  ToastBanner,
} from './components/GameModals';
import { PlotInspector } from './components/PlotInspector';
import { ShopWarehouseModal } from './components/ShopWarehouseModal';
import { TitleScreen } from './components/TitleScreen';
import { TopHud } from './components/TopHud';
import { useFarmGame } from './hooks/useFarmGame';
import { FarmCanvas } from './scene/FarmCanvas';

export default function App() {
  const game = useFarmGame();
  const [modalTab, setModalTab] = useState<'shop' | 'warehouse' | null>(null);
  const [confirmResetOpen, setConfirmResetOpen] = useState(false);

  // Auto-dismiss toast notifications after 4.5s
  useEffect(() => {
    if (!game.toast) return;
    const timer = window.setTimeout(() => {
      game.dismissToast();
    }, 4500);
    return () => window.clearTimeout(timer);
  }, [game]);

  // Tool hotkeys (1-4) & Escape to close modals
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (game.screenMode !== 'playing') return;
      if (e.key === '1') game.setActiveTool('seed_wheat');
      else if (e.key === '2') game.setActiveTool('seed_carrot');
      else if (e.key === '3') game.setActiveTool('water');
      else if (e.key === '4') game.setActiveTool('harvest');
      else if (e.key === 'Escape') {
        setModalTab(null);
        setConfirmResetOpen(false);
        game.setSelectedPlotId(null);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [game]);

  return (
    <main className="relative h-screen w-screen overflow-hidden" dir="rtl">
      {/* Full-bleed isolated 3D Farm Viewport */}
      <FarmCanvas
        plots={game.farmState.plots}
        selectedPlotId={game.selectedPlotId}
        nowMs={game.nowMs}
        isTitleMode={game.screenMode === 'title'}
        resetCameraSignal={game.resetCameraSignal}
        latestBurst={game.latestBurst}
        onPlotInteract={(plotId) => game.handlePlotAction(plotId)}
      />

      {game.screenMode === 'title' && (
        <TitleScreen authReady={game.authReady} onSignIn={game.signInWithGoogle} />
      )}

      {game.screenMode === 'loading_cloud' && (
        <CloudLoadOverlay
          error={game.loadError}
          onRetry={game.retryLoadCloudFarm}
          onSignOut={game.handleSignOut}
        />
      )}

      {game.screenMode === 'playing' && (
        <>
          <TopHud
            farmState={game.farmState}
            saveStatus={game.saveStatus}
            isLocalPreview={game.isLocalPreview}
            userEmail={game.user?.email ?? null}
            muted={game.muted}
            lastSavedAtMs={game.lastSavedAtMs}
            onToggleMute={game.toggleMute}
            onResetCamera={game.resetCamera}
            onRequestNewFarm={() => setConfirmResetOpen(true)}
            onRetrySave={game.retryCloudSave}
            onSignOut={game.handleSignOut}
          />

          <PlotInspector
            farmState={game.farmState}
            selectedPlotId={game.selectedPlotId}
            nowMs={game.nowMs}
            onClose={() => game.setSelectedPlotId(null)}
            onQuickAction={(plotId, tool) => game.handlePlotAction(plotId, tool)}
          />

          <BottomToolDock
            farmState={game.farmState}
            activeTool={game.activeTool}
            onSelectTool={game.setActiveTool}
            onOpenShop={() => setModalTab('shop')}
            onOpenWarehouse={() => setModalTab('warehouse')}
          />

          <ShopWarehouseModal
            tab={modalTab}
            farmState={game.farmState}
            onChangeTab={setModalTab}
            onClose={() => setModalTab(null)}
            onBuySeeds={game.handleBuySeeds}
            onSellCrops={game.handleSellCrops}
          />

          <ConfirmResetModal
            open={confirmResetOpen}
            onCancel={() => setConfirmResetOpen(false)}
            onConfirm={() => {
              setConfirmResetOpen(false);
              void game.confirmNewFarm();
            }}
          />

          {game.conflict && (
            <ConflictModal
              conflict={game.conflict}
              onUseServer={() => void game.resolveConflictUseServer()}
            />
          )}
        </>
      )}

      <ToastBanner toast={game.toast} onDismiss={game.dismissToast} />
    </main>
  );
}
