import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';

/**
 * Global keyboard shortcuts (documented in Help & Docs):
 *   g then o  -> Overview
 *   g then d  -> Disputes
 *   /         -> focus the disputes search box
 *   ?         -> Help & Docs
 * Implemented for real so the documented shortcuts actually work.
 */
export function useKeyboardShortcuts() {
  const nav = useNavigate();
  const pendingG = useRef(false);
  const gTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const typing = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);
      if (typing) return;

      if (e.key === '?') {
        e.preventDefault();
        nav('/help');
        return;
      }
      if (e.key === '/') {
        e.preventDefault();
        const el = document.querySelector<HTMLInputElement>('input[placeholder="Search disputes..."]');
        el?.focus();
        return;
      }
      if (pendingG.current) {
        if (e.key === 'o') { nav('/overview'); clearG(); return; }
        if (e.key === 'd') { nav('/disputes'); clearG(); return; }
        clearG();
      }
      if (e.key === 'g') {
        pendingG.current = true;
        if (gTimer.current) clearTimeout(gTimer.current);
        gTimer.current = setTimeout(() => { pendingG.current = false; }, 1200);
      }
    };
    const clearG = () => { pendingG.current = false; if (gTimer.current) clearTimeout(gTimer.current); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [nav]);
}
