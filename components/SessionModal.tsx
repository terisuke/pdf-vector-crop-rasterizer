import React from 'react';
import { X, Calendar, Layers } from 'lucide-react';

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
  
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-gray-800 rounded-lg p-6 max-w-lg w-full max-h-96 overflow-auto">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold text-white">Load Session</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white">
            <X size={24} />
          </button>
        </div>
        
        {sessions.length === 0 ? (
          <p className="text-gray-400">No saved sessions found</p>
        ) : (
          <div className="space-y-2">
            {sessions.map(session => (
              <button
                key={session.id}
                onClick={() => {
                  onSelectSession(session.id);
                  onClose();
                }}
                className="w-full bg-gray-700 hover:bg-gray-600 p-3 rounded-md text-left transition-colors"
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