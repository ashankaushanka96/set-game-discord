export default function Card({ suit="spades", rank="A", size="md" }) {
    const SUIT_SYMBOL = { hearts:"♥", diamonds:"♦", clubs:"♣", spades:"♠" };
    const red = suit === "hearts" || suit === "diamonds";
    const sizes = {
      sm: { w: 44, h: 60, r: 8, f: 12, big: 18 },
      md: { w: 64, h: 88, r: 10, f: 14, big: 24 },
      lg: { w: 96, h: 132, r: 12, f: 18, big: 36 },
    };
    const S = sizes[size] || sizes.md;
  
    return (
      <div
        className="relative bg-white card-shadow"
        style={{
          width: S.w, height: S.h, borderRadius: S.r,
          border: "1px solid rgba(0,0,0,.15)",
        }}
      >
        {/* Corners */}
        <div
          style={{
            position: "absolute", top: 6, left: 6,
            fontSize: S.f, lineHeight: "1.1em",
            color: red ? "#dc2626" : "#111827",
            textAlign: "center", fontWeight: 700, width: S.w/3,
          }}
        >
          {rank}
          <div style={{ fontWeight: 600 }}>{SUIT_SYMBOL[suit]}</div>
        </div>
        <div
          style={{
            position: "absolute", bottom: 6, right: 6,
            transform: "rotate(180deg)",
            fontSize: S.f, lineHeight: "1.1em",
            color: red ? "#dc2626" : "#111827",
            textAlign: "center", fontWeight: 700, width: S.w/3,
          }}
        >
          {rank}
          <div style={{ fontWeight: 600 }}>{SUIT_SYMBOL[suit]}</div>
        </div>
  
        {/* Center suit */}
        <div
          style={{
            position: "absolute", inset: 0,
            display: "grid", placeItems: "center",
            fontSize: S.big, color: red ? "#ef4444" : "#111827",
            opacity: 0.9
          }}
        >
          {SUIT_SYMBOL[suit]}
        </div>
      </div>
    );
  }
  