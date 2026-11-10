export default function Seat({ seatIndex, player, highlight, selectable, onSelect, team, isMe, isLaydownPlayer, isSpeaking, isDealer, dropTarget = false, draggingCards = false }) {
  return <button type="button" data-seat={seatIndex}
    className={`game-seat game-seat--${team?.toLowerCase() || 'empty'} ${dropTarget ? 'game-seat--drop-target' : ''} ${isMe ? 'game-seat--me' : ''} ${selectable ? 'game-seat--selectable' : ''} ${isSpeaking ? 'game-seat--speaking' : ''} ${highlight || isLaydownPlayer ? 'game-seat--active' : ''}`}
    aria-label={`${player?.name || 'Empty seat'}, seat ${seatIndex + 1}${team ? `, Team ${team}` : ''}${isMe ? ', you' : ''}${selectable ? ', pass selected cards' : ''}`}
    aria-disabled={!selectable} onClick={() => selectable && player && onSelect?.(player)}>
    <span className="game-seat__avatar">{player?.avatar?.startsWith('http') ? <img src={player.avatar} alt="" referrerPolicy="no-referrer" /> : <span>{player?.avatar || '♠'}</span>}</span>
    <strong className="game-seat__name">{player?.name || 'Open seat'}</strong>
    <span className="game-seat__detail">{dropTarget ? 'Release to pass ↓' : selectable && draggingCards ? 'Drop cards here' : selectable ? 'Pass cards ↗' : `Seat ${seatIndex + 1}${isMe ? ' · You' : ''}`}</span>
    {player && team && <span className="game-seat__team">Team {team}</span>}
    {(isDealer || isLaydownPlayer || highlight) && <span className="game-seat__badge">{isLaydownPlayer ? 'Declaring' : highlight ? 'Your turn' : 'Dealer'}</span>}
    {player && <i className={`status-dot game-seat__status ${player.connected === false ? 'status-dot--offline' : ''}`} />}
  </button>;
}
