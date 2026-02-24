import React, { useEffect } from 'react';

/** Renders text with **bold** and line breaks */
function RichText({ text }: { text: string }) {
  const paragraphs = text.split(/\n\n+/);
  return (
    <div className="space-y-3">
      {paragraphs.map((para, i) => (
        <div key={i} className="space-y-1">
          {para.split('\n').map((line, j) => {
            const isBullet = line.startsWith('• ');
            const content = isBullet ? line.slice(2) : line;
            const parts = content.split(/(\*\*[^*]+\*\*)/g);
            const rendered = parts.map((p, k) =>
              p.startsWith('**') && p.endsWith('**')
                ? React.createElement('strong', { key: k }, p.slice(2, -2))
                : p
            );
            return (
              <div key={j} className={isBullet ? 'flex gap-2' : ''}>
                {isBullet && <span className="text-blue-400 flex-shrink-0">•</span>}
                <span className="text-gray-300 text-sm leading-relaxed">{rendered}</span>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

export interface PageInfoModalProps {
  /** Main description text displayed in the modal */
  description?: string;
  /** List of quick tips shown as bullet points */
  quickTips?: string[];
  /** If true, modal opens automatically on mount */
  autoOpen?: boolean;
  /** Called when modal is auto-opened (use to prevent auto-opening again) */
  onAutoOpened?: () => void;
  /** Optional custom title (default: "About this page") */
  title?: string;
}

const PageInfoModal: React.FC<PageInfoModalProps> = ({
  description = '',
  quickTips = [],
  autoOpen = false,
  onAutoOpened,
  title = 'About this page'
}) => {
  const [isOpen, setIsOpen] = React.useState(autoOpen);

  useEffect(() => {
    if (autoOpen) {
      setIsOpen(true);
      onAutoOpened?.();
    }
  }, [autoOpen, onAutoOpened]);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsOpen(false);
    };
    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      return () => document.removeEventListener('keydown', handleEscape);
    }
  }, [isOpen]);

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="inline-flex items-center justify-center ml-2 flex-shrink-0 text-red-500 hover:text-red-600 transition-colors p-0.5"
        title={title}
        aria-label={title}
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6">
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="16" x2="12" y2="12" />
          <line x1="12" y1="8" x2="12.01" y2="8" />
        </svg>
      </button>

      {isOpen && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50"
          onClick={() => setIsOpen(false)}
        >
          <div
            className="bg-gray-800 dark:bg-[#2c2e3a] rounded-lg shadow-xl max-w-md w-full p-6 border border-gray-700"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center gap-3 mb-4">
              <div className="flex items-center justify-center flex-shrink-0 text-red-500">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="16" x2="12" y2="12" />
                  <line x1="12" y1="8" x2="12.01" y2="8" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-white">{title}</h3>
            </div>

            {/* Description */}
            {description && (
              <div className="mb-4">
                <RichText text={description} />
              </div>
            )}

            {/* Quick Tips */}
            {quickTips.length > 0 && (
              <div className="bg-gray-700/50 dark:bg-[#383a48] rounded-lg p-4 mb-4">
                <h4 className="text-blue-400 font-semibold text-xs uppercase tracking-wider mb-3">
                  Quick Tips
                </h4>
                <ul className="space-y-2">
                  {quickTips.map((tip, i) => (
                    <li key={i} className="flex gap-2 text-sm text-gray-300">
                      <span className="text-blue-400 mt-1">•</span>
                      <span>{tip}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <p className="text-center text-gray-500 text-xs">
              Click anywhere or press Esc to close
            </p>
          </div>
        </div>
      )}
    </>
  );
};

export default PageInfoModal;
