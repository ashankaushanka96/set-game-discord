import { useEffect, useRef } from "react";
import { useStore } from "../../store";
import { Card } from "../cards";

export default function MessageFeed() {
  const { messages } = useStore();
  const endRef = useRef(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const list = Array.isArray(messages) ? messages : [];

  const getMessageStyles = (side) => {
    if (side === "left") {
      return {
        bg: 'bg-zinc-700/90 border-zinc-600',
        icon: (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
        )
      };
    } else {
      return {
        bg: 'bg-indigo-600/90 border-indigo-500',
        icon: (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
        )
      };
    }
  };

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-3 z-40">
      <div className="mx-auto max-w-[720px] px-3">
        <div className="space-y-2">
          {list.map((m) => {
            const styles = getMessageStyles(m.side);
            return (
              <div
                key={m.id}
                className={`flex ${m.side === "left" ? "justify-start" : "justify-end"}`}
              >
                <div className={`pointer-events-auto ${styles.bg} border rounded-xl px-4 py-3 shadow-lg max-w-xs`}>
                  <div className="flex items-start gap-2">
                    <div className="flex-shrink-0 text-white/80">
                      {styles.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      {m.avatar && (
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-sm">{m.avatar}</span>
                          <span className="text-xs text-white/70 font-medium">{m.name}</span>
                        </div>
                      )}
                      <div className="text-sm text-white leading-relaxed">
                        {m.text}
                      </div>
                      {m.card && (
                        <div className="mt-2 flex items-center gap-2">
                          <Card suit={m.card.suit} rank={m.card.rank} size="sm" />
                          <span className="text-xs text-white/70">
                            {m.card.rank} of {m.card.suit}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
          <div ref={endRef} />
        </div>
      </div>
    </div>
  );
}
