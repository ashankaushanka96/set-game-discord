import { motion, AnimatePresence } from 'framer-motion';

export default function PlayerHand({ cards }) {
  return (
    <div className="flex gap-2">
      <AnimatePresence>
        {(cards || []).map((c, i) => {
          const suit = c?.suit ?? 's';
          const rank = c?.rank ?? 'r';
          return (
            <motion.div
              key={`${suit}-${rank}-${i}`}   // safe, unique fallback with index
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: -20, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 300, damping: 20 }}
              className="w-12 h-16 bg-white text-black rounded-lg card-shadow grid place-items-center"
            >
              <div className="text-center text-xs">
                <div className="font-bold">{rank}</div>
                <div className="capitalize">{suit}</div>
              </div>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
