import GlassmorphismModal from "../ui/GlassmorphismModal";

// Turn Play: after a successful laydown where both helping teammates still have cards,
// the declarer chooses which of them plays next.
export default function PassTurnModal({ options = [], players = {}, onPick }) {
  if (!options.length) return null;
  return (
    <GlassmorphismModal isOpen onClose={() => {}} onClickOutside={false} size="sm" docked peekLabel="Choose who plays next">
      <div className="ask-sheet">
        <div>
          <h2>Set laid down! Pass the turn</h2>
          <p>Both teammates helped with this set. Choose who plays next.</p>
        </div>
        <div className="pass-turn-options">
          {options.map((id) => {
            const p = players[id];
            if (!p) return null;
            return (
              <button key={id} type="button" className="pass-turn-option" onClick={() => onPick(id)}>
                <span className="club-avatar">
                  {p.avatar?.startsWith("http") ? <img src={p.avatar} alt="" referrerPolicy="no-referrer" /> : <span>{p.avatar || "♠"}</span>}
                </span>
                <span className="pass-turn-option__name">{p.name}</span>
                <span className="pass-turn-option__cards">{p.hand?.length ?? 0} cards</span>
              </button>
            );
          })}
        </div>
      </div>
    </GlassmorphismModal>
  );
}
