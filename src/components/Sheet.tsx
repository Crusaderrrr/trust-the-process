import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import Icon from './Icon';

/** Bottom sheet over a dimmed backdrop; tap outside to close. */
export default function Sheet({
  title,
  onClose,
  children,
  full = false,
}: {
  title?: string;
  onClose: () => void;
  children: ReactNode;
  full?: boolean;
}) {
  // Portal to <body>: inside a scroll container iOS confines z-index to that container, so
  // the tab bar (a sibling of the scroll area) would paint over the sheet.
  return createPortal(
    <div className="fade-in fixed inset-0 z-40 flex flex-col justify-end bg-black/70 backdrop-blur-[2px]" onClick={onClose}>
      <div
        className={`ui-sheet sheet-up flex flex-col rounded-t-3xl pb-[max(1rem,env(safe-area-inset-bottom))] ${
          full ? 'h-[92%]' : 'max-h-[85%]'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-neutral-700" />
        <div className="flex items-center justify-between px-4 pt-2 pb-2">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button
            className="flex h-8 w-8 items-center justify-center rounded-full bg-white/[0.06] text-neutral-400"
            onClick={onClose}
            aria-label="Close"
          >
            <Icon name="close" className="h-5 w-5" />
          </button>
        </div>
        <div className="scroll-area flex min-h-0 flex-1 flex-col px-4 pt-1">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
