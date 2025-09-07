import { useEffect, useRef } from "react";
import { useStore } from "../store";
import Card from "./Card";

export default function MessageFeed() {
  const { messages } = useStore();
  const endRef = useRef(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const list = Array.isArray(messages) ? messages : [];

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-3 z-40">
      <div className="mx-auto max-w-[720px] px-3">
        <div className="space-y-2">
          {list.map((m) => (
            <div
              key={m.id}
              className={`flex ${m.side === "left" ? "justify-start" : "justify-end"}`}
            >
              <div
                className={`pointer-events-auto rounded-2xl px-3 py-2 card-shadow ${
                  m.side === "left" ? "bg-zinc-800" : "bg-indigo-600"
                } text-sm flex items-center gap-2`}
              >
                {m.avatar && <span className="text-lg">{m.avatar}</span>}
                <div className="leading-tight">
                  <div className="text-[11px] opacity-70">{m.name}</div>
                  <div className="font-medium">{m.text}</div>
                </div>
                {m.card && (
                  <div className="ml-2 shrink-0">
                    <Card suit={m.card.suit} rank={m.card.rank} size="sm" />
                  </div>
                )}
              </div>
            </div>
          ))}
          <div ref={endRef} />
        </div>
      </div>
    </div>
  );
}
