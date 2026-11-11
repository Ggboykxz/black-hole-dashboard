"use client";

/* Source : BoardUI (boardui.com), composant `use-count-up`, licence du
   registre BoardUI — copié tel quel, commentaires d'origine conservés.
   Le hook ne porte ni style ni token : aucune autre pièce de BoardUI
   n'est requise (la dépendance « globals » listée par le registre ne
   sert qu'aux composants visuels de la même famille). */

import { useEffect, useRef, useState } from "react";

const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

/**
 * Rolls the displayed number from its current value to `target` with an
 * ease-out curve. Used by the dashboard chart cards so headline figures
 * animate when the dataset or the hovered point changes.
 */
export function useCountUp(target: number, duration = 320) {
  const [display, setDisplay] = useState(target);
  const fromRef = useRef(target);

  useEffect(() => {
    const from = fromRef.current;
    if (from === target) return;
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const value = Math.round(from + (target - from) * easeOutCubic(t));
      fromRef.current = value;
      setDisplay(value);
      if (t < 1) raf = requestAnimationFrame(tick);
      else fromRef.current = target;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);

  return display;
}
