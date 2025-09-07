export const RANKS_LOWER = ["2","3","4","5","6","7"];
export const RANKS_UPPER = ["8","9","10","J","Q","K","A"];
export const SUITS = ["hearts","diamonds","clubs","spades"];

export const SUIT_SYMBOL = {
  hearts: "♥",
  diamonds: "♦",
  clubs: "♣",
  spades: "♠",
};

export const SUIT_COLOR = {
  hearts: "#e11d48",   // rose-600
  diamonds: "#e11d48",
  clubs: "#111827",    // gray-900 (near-black)
  spades: "#111827",
};

export const isRed = (suit) => suit === "hearts" || suit === "diamonds";

export const firstCardOfSet = (suit, setType) => ({
  suit,
  rank: setType === "lower" ? "2" : "8",
});
