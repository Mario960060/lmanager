import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { colors, radii, transitions } from '../themes/designTokens';

/** Renders text with **bold**, *italic*, and line breaks. Italic can contain bold. */
function renderInlineFormatting(content: string): React.ReactNode[] {
  const result: React.ReactNode[] = [];
  let remaining = content;
  let key = 0;
  while (remaining.length > 0) {
    const boldMatch = remaining.match(/^\*\*([^*]+)\*\*/);
    if (boldMatch) {
      result.push(React.createElement('strong', { key: key++ }, boldMatch[1]));
      remaining = remaining.slice(boldMatch[0].length);
      continue;
    }
    if (remaining[0] === '*' && remaining.length > 1) {
      const lastStar = remaining.lastIndexOf('*');
      if (lastStar > 0) {
        const innerContent = remaining.slice(1, lastStar);
        const innerNodes = renderInlineFormatting(innerContent);
        result.push(React.createElement('em', { key: key++, className: 'italic' }, innerNodes));
        remaining = remaining.slice(lastStar + 1);
        continue;
      }
    }
    const nextBold = remaining.indexOf('**');
    const nextItalic = remaining.indexOf('*');
    const next = (nextBold >= 0 && nextItalic >= 0)
      ? Math.min(nextBold, nextItalic)
      : nextBold >= 0 ? nextBold : nextItalic >= 0 ? nextItalic : remaining.length;
    result.push(remaining.slice(0, next));
    remaining = remaining.slice(next);
  }
  return result;
}

function RichText({ text }: { text: string }) {
  const paragraphs = text.split(/\n\n+/);
  return (
    <div className="space-y-3">
      {paragraphs.map((para, i) => (
        <div key={i} className="space-y-1">
          {para.split('\n').map((line, j) => {
            const isBullet = line.startsWith('• ');
            const content = isBullet ? line.slice(2) : line;
            const rendered = renderInlineFormatting(content);
            return (
              <div key={j} className={isBullet ? 'flex gap-2' : ''}>
                {isBullet && <span className="text-blue-400 flex-shrink-0">•</span>}
                <span className="text-sm leading-relaxed" style={{ color: colors.textMuted }}>{rendered}</span>
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
  /** Optional important note with left border styling */
  importantNote?: string;
  /** List of quick tips shown as bullet points */
  quickTips?: string[];
  /** If true, modal opens automatically on mount */
  autoOpen?: boolean;
  /** Called when modal is auto-opened (use to prevent auto-opening again) */
  onAutoOpened?: () => void;
  /** Optional custom title (default: "About this page") */
  title?: string;
}

const LONG_CONTENT_THRESHOLD = 500;

const PageInfoModal: React.FC<PageInfoModalProps> = ({
  description = '',
  importantNote,
  quickTips = [],
  autoOpen = false,
  onAutoOpened,
  title
}) => {
  const { t } = useTranslation('common');
  const displayTitle = title ?? t('about_this_page');
  const [isOpen, setIsOpen] = React.useState(autoOpen);
  const isLongContent = description.length > LONG_CONTENT_THRESHOLD || (importantNote?.length ?? 0) > 100;

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

  const [hovered, setHovered] = useState(false);
  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          width: 22, height: 22, borderRadius: '50%',
          background: hovered ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.05)',
          border: `1px solid rgba(255,255,255,0.08)`,
          color: hovered ? colors.textSubtle : colors.textFaint,
          fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer', flexShrink: 0, marginLeft: 8, transition: transitions.fast,
        }}
        title={displayTitle}
        aria-label={displayTitle}
      >
        i
      </button>

      {isOpen && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6 bg-black/50"
          onClick={() => setIsOpen(false)}
        >
          <div
            className={`rounded-lg shadow-xl w-full max-h-[90vh] flex flex-col border ${isLongContent ? 'max-w-[95vw] sm:max-w-2xl lg:max-w-4xl' : 'max-w-md'}`}
            style={{ backgroundColor: colors.bgCard, borderColor: colors.borderDefault }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header - fixed */}
            <div className="flex items-center gap-3 p-6 pb-4 flex-shrink-0">
              <div className="flex items-center justify-center flex-shrink-0 text-red-500">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="16" x2="12" y2="12" />
                  <line x1="12" y1="8" x2="12.01" y2="8" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-white">{title}</h3>
            </div>

            {/* Content - scrollable when long */}
            <div className={`flex-1 min-h-0 px-6 ${isLongContent ? 'overflow-y-auto' : ''}`}>
              {description && (
                <div className="mb-4">
                  <RichText text={description} />
                </div>
              )}

              {importantNote && (
                <div className="mb-4 pl-4 border-l-2 border-blue-400/60">
                  <RichText text={importantNote} />
                </div>
              )}

              {quickTips.length > 0 && (
                <div className="bg-gray-700/50 dark:bg-[#383a48] rounded-lg p-4 mb-4">
                  <h4 className="text-blue-400 font-semibold text-xs uppercase tracking-wider mb-3">
                    {t('common:quick_tips')}
                  </h4>
                  <ul className="space-y-2">
                    {quickTips.map((tip, i) => (
                      <li key={i} className="flex gap-2 text-sm" style={{ color: colors.textMuted }}>
                        <span className="text-blue-400 mt-1">•</span>
                        <span>{tip}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            {/* Footer - fixed */}
            <p className="text-center text-xs p-6 pt-4 flex-shrink-0" style={{ color: colors.textSubtle }}>
              {t('click_anywhere_close')}
            </p>
          </div>
        </div>
      )}
    </>
  );
};

export default PageInfoModal;
