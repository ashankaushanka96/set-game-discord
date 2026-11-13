export default function Seat({ seatIndex, player, highlight, selectable, onSelect, team, isMe, isLaydownPlayer, isSpeaking, isDealer, dropTarget = false, draggingCards = false, isTurn = false, askMode = false, reactEmoji = null, pickLabel = null, isOut = false }) {
  return <button type="button" data-seat={seatIndex}
    className={`game-seat game-seat--${team?.toLowerCase() || 'empty'} ${dropTarget ? 'game-seat--drop-target' : ''} ${isMe ? 'game-seat--me' : ''} ${selectable ? 'game-seat--selectable' : ''} ${isSpeaking ? 'game-seat--speaking' : ''} ${highlight || isLaydownPlayer ? 'game-seat--active' : ''} ${isTurn ? 'game-seat--turn' : ''} ${isOut ? 'game-seat--out' : ''}`}
    aria-label={`${player?.name || 'Empty seat'}, seat ${seatIndex + 1}${team ? `, Team ${team}` : ''}${isMe ? ', you' : ''}${isTurn ? ', has the turn' : ''}${isOut ? ', no cards left' : ''}${selectable ? (pickLabel ? `, ${pickLabel}` : reactEmoji ? `, send ${reactEmoji}` : askMode ? ', ask for a card' : ', pass selected cards') : ''}`}
    aria-disabled={!selectable} onClick={() => selectable && player && onSelect?.(player)}>
    <span className="game-seat__avatar">{player?.avatar?.startsWith('http') ? <img src={player.avatar} alt="" referrerPolicy="no-referrer" /> : <span>{player?.avatar || '♠'}</span>}</span>
    <strong className="game-seat__name">{player?.name || 'Open seat'}</strong>
    <span className="game-seat__detail">{dropTarget ? 'Release to pass ↓' : selectable && draggingCards ? 'Drop cards here' : selectable && pickLabel ? pickLabel : selectable && reactEmoji ? `Send ${reactEmoji}` : selectable ? (askMode ? 'Ask for a card ?' : 'Pass cards ↗') : `Seat ${seatIndex + 1}${isMe ? ' · You' : ''}`}</span>
    {player && team && <span className="game-seat__team">Team {team}</span>}
    {(isDealer || isLaydownPlayer || highlight || isTurn) && <span className="game-seat__badge">{isLaydownPlayer ? 'Declaring' : highlight || (isTurn && isMe) ? 'Your turn' : isTurn ? 'Turn' : 'Dealer'}</span>}
    {player && <i className={`status-dot game-seat__status ${player.connected === false ? 'status-dot--offline' : ''}`} />}
  </button>;
}
