import { FannedCards, ColorCodedFannedCards } from '../cards';
import GlassmorphismModal from '../ui/GlassmorphismModal';

export default function LaydownResultModal({ 
  open, 
  onClose, 
  laydownData,
  state 
}) {
  if (!open || !laydownData) return null;


  const players = state?.players || {};

  return (
    <GlassmorphismModal 
      isOpen={open} 
      onClose={onClose} 
      size="2xl"
      onClickOutside={false}
    >
      <div className="text-center">
        {/* Header */}
        <div className="mb-6">
          <h2 className="text-2xl font-bold text-white mb-2">
            {laydownData.success ? '🎉 Laydown Successful!' : '❌ Laydown Failed'}
          </h2>
          <div className="text-white/70">
            {laydownData.suit} {laydownData.setType} - {laydownData.points} points to Team {laydownData.team}
          </div>
        </div>

          {/* Player Contributions */}
          <div className="space-y-4 mb-6">
            <h3 className="text-lg font-semibold text-white">Player Contributions</h3>
            {laydownData.contributors && laydownData.contributors.map((contributor, index) => {
              const playerName = players[contributor.player_id]?.name || `Player ${index + 1}`;
              
              // Use the same color coding logic as Card Analysis
              const playerCards = (contributor.cards || []).map(card => {
                // Check if this card was part of the claimed set
                const wasClaimed = laydownData.claimedCards?.some(c => c.suit === card.suit && c.rank === card.rank) || false;
                // Check if this card was actually held by the team (same logic as Card Analysis)
                const wasActual = laydownData.actualCards?.some(c => c.suit === card.suit && c.rank === card.rank) || false;
                
                let overlayColor = 'transparent';
                if (wasClaimed && wasActual) {
                  // Card was claimed AND actually held - correctly claimed (green)
                  overlayColor = 'rgba(74, 222, 128, 0.3)'; // green
                } else if (wasClaimed && !wasActual) {
                  // Card was claimed but NOT actually held - wrongly claimed (red)
                  overlayColor = 'rgba(248, 113, 113, 0.3)'; // red
                }
                
                return {
                  ...card,
                  overlayStyle: {
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    backgroundColor: overlayColor,
                    borderRadius: '8px',
                    pointerEvents: 'none',
                    zIndex: 10
                  }
                };
              });
              
              return (
                <div key={contributor.player_id} className="bg-white/10 backdrop-blur-sm border border-white/20 rounded-xl p-4">
                  <div className="text-sm font-medium text-white mb-2">{playerName}</div>
                  <div className="flex justify-center">
                    <FannedCards 
                      cards={playerCards} 
                      size="sm" 
                      maxCards={8}
                    />
                  </div>
                </div>
              );
            })}
          </div>

        {/* Color-Coded Analysis */}
        <div className="space-y-4 mb-6">
          <h3 className="text-lg font-semibold text-white">
            {laydownData.success ? 'Cards Successfully Laid Down' : 'Card Analysis'}
          </h3>
          <div className="bg-white/10 backdrop-blur-sm border border-white/20 rounded-xl p-4">
            <div className="text-sm text-white/70 mb-3">
              {laydownData.success 
                ? 'All claimed cards were correctly held and laid down'
                : 'Comparison of claimed vs actual cards'
              }
            </div>
             <div className="flex justify-center">
               <ColorCodedFannedCards 
                 claimedCards={laydownData.claimedCards || []} 
                 actualCards={laydownData.actualCards || []} 
                 size="md" 
                 maxCards={15}
               />
             </div>
          </div>
        </div>

        {/* Missing Cards Explanation (for failures) */}
        {!laydownData.success && (
          <div className="bg-red-500/10 backdrop-blur-sm border border-red-500/30 rounded-xl p-4 mb-6">
            <div className="text-red-400 font-medium mb-2">⚠️ What Went Wrong</div>
            <div className="text-sm text-white/80">
              Players claimed to have cards they didn't actually possess. The red-bordered cards above 
              show which cards were claimed but missing from players' hands.
            </div>
          </div>
        )}

        {/* Handoff Information (for successful laydowns) */}
        {laydownData.success && laydownData.handoffEligible && laydownData.handoffEligible.length > 0 && (
          <div className="bg-blue-500/10 backdrop-blur-sm border border-blue-500/30 rounded-xl p-4 mb-6">
            <div className="text-blue-400 font-medium mb-2">🔄 Handoff Available</div>
            <div className="text-sm text-white/80">
              The following players can now receive handoff cards: {
                laydownData.handoffEligible.map(id => players[id]?.name || 'Unknown').join(', ')
              }
            </div>
          </div>
        )}

        {/* Action Button */}
        <div className="flex justify-center">
          <button
            onClick={onClose}
            className="bg-gradient-to-r from-accent-blue to-blue-500 hover:from-accent-blue/80 hover:to-blue-500/80 
                     text-white px-8 py-3 rounded-xl font-medium transition-all duration-200 
                     shadow-lg hover:shadow-blue-500/25 hover:scale-105 active:scale-95"
          >
            Continue
          </button>
        </div>
      </div>
    </GlassmorphismModal>
  );
}
