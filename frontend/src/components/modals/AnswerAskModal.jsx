import GlassmorphismModal from "../ui/GlassmorphismModal";
import Card from "../cards/Card";
import { useT } from "../../i18n";

// Turn Play: shown to the asked player. The server decides what moves;
// the button just confirms it, so nobody can hold back a card they have.
export default function AnswerAskModal({ ask, asker, onAnswer }) {
  if (!ask) return null;
  const ranks = ask.ranks || [];
  const many = ranks.length > 1;
  const t = useT();
  const asking = t("{name} is asking you", { name: asker?.name || t("An opponent") });
  return (
    <GlassmorphismModal isOpen onClose={() => {}} onClickOutside={false} size="sm" docked peekLabel={asking}>
      <div className="ask-sheet">
        <div>
          <h2>{asking}</h2>
          <p>{t(ask.has_card ? (many ? "You have all of these, so they go to them." : "You have this card, so it goes to them.") : (many ? "You don't have all of these, so nothing moves. The turn comes to you." : "You don't have this card. The turn comes to you."))}</p>
        </div>
        <div className="ask-sheet__asked">
          {ranks.map((r) => <Card key={r} suit={ask.suit} rank={r} size={many ? "sm" : "md"} />)}
        </div>
        <div className="ask-sheet__actions">
          <button type="button" className="club-primary" onClick={onAnswer}>
            {t(ask.has_card ? (many ? "Hand them over" : "Hand it over") : (many ? "Not all — take my turn" : "I don't have it — take my turn"))}
          </button>
        </div>
      </div>
    </GlassmorphismModal>
  );
}
