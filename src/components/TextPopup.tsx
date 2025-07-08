import React from 'react';
import ReactDOM from 'react-dom';
import { X } from 'lucide-react';

interface TextPopupProps {
  text: string;
  isOpen: boolean;
  onClose: () => void;
}

export const TextPopup: React.FC<TextPopupProps> = ({ text, isOpen, onClose }) => {
  if (!isOpen) return null;

  return ReactDOM.createPortal(
    <div 
      className="fixed bg-black bg-opacity-50 flex items-center justify-center z-[9999] p-4"
      style={{ 
        position: 'fixed',
        top: '0',
        left: '0',
        width: '100vw',
        height: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 99999
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div 
        className="bg-white rounded-lg shadow-2xl transform scale-100 animate-fadeIn"
        style={{
          position: 'relative',
          zIndex: 100000,
          width: '90vw',
          //height:'50vh',
          minHeight:'50Vh',
          maxWidth: '600px',
          maxHeight: '80vh',
          display: 'flex',
          flexDirection: 'column'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex justify-between items-center p-4 border-b border-gray-200">
          <h3 className="text-3xl font-semibold text-[#333333]">メモ詳細</h3>
        </div>
        
        {/* Content */}
        <div 
          className="p-4 overflow-y-auto flex-1"
          style={{
            maxHeight: 'calc(80vh - 120px)',
            lineHeight: '2'
          }}
        >
          <p className=
            "text-[#333333] whitespace-pre-wrap break-words text-4xl leading-relaxed font-medium">
            {text}
          </p>
        </div>
        
        {/* Footer */}
        <div className="p-4 border-t border-gray-200 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-[#007bff] text-white rounded-md hover:bg-blue-600 transition-colors duration-200"
          >
            閉じる
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};