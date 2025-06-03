import { Calendar, X } from 'lucide-react';
import React, { useEffect, useRef } from 'react';

interface SessionModalProps {
  isOpen: boolean;
  onClose: () => void;
  sessions: Array<{id: string, timestamp: string, floor: string}>;
  onSelectSession: (sessionId: string) => void;
}

export const SessionModal: React.FC<SessionModalProps> = ({
  isOpen, onClose, sessions, onSelectSession
}) => {
  if (!isOpen) return null;
  
  // フォーカストラップ用
  const modalRef = useRef<HTMLDivElement>(null);
  const firstFocusableRef = useRef<HTMLButtonElement>(null);
  const closeBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    // 最初のフォーカス
    firstFocusableRef.current?.focus();
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Tab') {
        const focusableEls = modalRef.current?.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        if (!focusableEls || focusableEls.length === 0) return;
        const firstEl = focusableEls[0];
        const lastEl = focusableEls[focusableEls.length - 1];
        if (e.shiftKey) {
          if (document.activeElement === firstEl) {
            e.preventDefault();
            lastEl.focus();
          }
        } else {
          if (document.activeElement === lastEl) {
            e.preventDefault();
            firstEl.focus();
          }
        }
      } else if (e.key === 'Escape') {
        onClose();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div
        className="bg-gray-800 rounded-lg p-6 max-w-lg w-full max-h-96 overflow-auto outline-none"
        role="dialog"
        aria-modal="true"
        aria-labelledby="session-modal-title"
        ref={modalRef}
        tabIndex={-1}
      >
        <div className="flex justify-between items-center mb-4">
          <h2 id="session-modal-title" className="text-xl font-bold text-white">Load Session</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white"
            ref={closeBtnRef}
            tabIndex={0}
            aria-label="Close modal"
            onKeyDown={e => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onClose();
              }
            }}
          >
            <X size={24} />
          </button>
        </div>
        
        {sessions.length === 0 ? (
          <p className="text-gray-400">No saved sessions found</p>
        ) : (
          <div className="space-y-2">
            {sessions.map((session, idx) => (
              <button
                key={session.id}
                onClick={() => {
                  onSelectSession(session.id);
                  onClose();
                }}
                className="w-full bg-gray-700 hover:bg-gray-600 p-3 rounded-md text-left transition-colors"
                ref={idx === 0 ? firstFocusableRef : undefined}
              >
                <div className="flex justify-between items-center">
                  <span className="text-white font-medium">{session.id}</span>
                  <span className="text-sky-400">{session.floor}</span>
                </div>
                <div className="flex items-center text-gray-400 text-sm mt-1">
                  <Calendar size={14} className="mr-1" />
                  {new Date(session.timestamp).toLocaleString()}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};