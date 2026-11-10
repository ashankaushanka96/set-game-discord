const key = card => `${card.suit}-${card.rank}`;
export function mergeReceivedCards(previous = [], incoming = []) {
  return [...new Map([...previous, ...incoming].map(card => [key(card), { suit:card.suit,rank:card.rank }])).values()];
}
export function removePassedCards(previous = [], outgoing = []) {
  const sent = new Set(outgoing.map(key));
  return previous.filter(card => !sent.has(key(card)));
}
