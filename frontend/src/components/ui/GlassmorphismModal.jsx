import { useEffect, useRef } from 'react';

export default function GlassmorphismModal({ 
  isOpen, 
  onClose, 
  children, 
  className = "",
  overlayClassName = "",
  onClickOutside = true,
  size = "md" 
}) {
  const modalRef = useRef(null);

  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === 'Escape' && isOpen) {
        onClose?.();
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      document.body.style.overflow = 'hidden';
    }

    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = 'unset';
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const sizeClasses = {
    sm: "max-w-sm",
    md: "max-w-md", 
    lg: "max-w-lg",
    xl: "max-w-xl",
    "2xl": "max-w-2xl",
    "3xl": "max-w-3xl",
    "4xl": "max-w-4xl",
    full: "max-w-full mx-4"
  };

  return (
    <div 
      className={`fixed inset-0 z-50 flex items-center justify-center p-4 ${overlayClassName}`}
      onClick={onClickOutside ? onClose : undefined}
    >
      {/* Animated backdrop */}
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm animate-in fade-in duration-300" />
      
      {/* Floating liquid effect */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute -top-1/2 -left-1/2 w-full h-full bg-gradient-to-br from-accent-blue/10 via-accent-purple/5 to-accent-cyan/10 rounded-full blur-3xl liquid-bg-1" />
        <div className="absolute -bottom-1/2 -right-1/2 w-full h-full bg-gradient-to-tl from-accent-pink/10 via-accent-emerald/5 to-accent-amber/10 rounded-full blur-3xl liquid-bg-2" />
      </div>

      {/* Modal container */}
      <div 
        ref={modalRef}
        className={`
          relative w-full ${sizeClasses[size]} max-h-[90vh] 
          bg-white/3 backdrop-blur-xl 
          border border-white/10 
          rounded-3xl shadow-2xl
          animate-in zoom-in-95 slide-in-from-bottom-4 duration-300
          glassmorphism-modal
          ${className}
        `}
        onClick={(e) => e.stopPropagation()}
        style={{
          background: `
            linear-gradient(135deg, 
              rgba(255, 255, 255, 0.05) 0%, 
              rgba(255, 255, 255, 0.02) 50%, 
              rgba(255, 255, 255, 0.01) 100%
            ),
            radial-gradient(circle at 30% 20%, rgba(139, 92, 246, 0.08) 0%, transparent 50%),
            radial-gradient(circle at 70% 80%, rgba(59, 130, 246, 0.08) 0%, transparent 50%),
            radial-gradient(circle at 20% 80%, rgba(236, 72, 153, 0.05) 0%, transparent 50%)
          `,
          boxShadow: `
            0 25px 50px -12px rgba(0, 0, 0, 0.15),
            0 0 0 1px rgba(255, 255, 255, 0.05),
            inset 0 1px 0 rgba(255, 255, 255, 0.05)
          `
        }}
      >
        {/* Inner glow effect */}
        <div 
          className="absolute inset-0 rounded-3xl"
          style={{
            background: `
              radial-gradient(circle at 50% 0%, rgba(255, 255, 255, 0.05) 0%, transparent 70%),
              linear-gradient(180deg, rgba(255, 255, 255, 0.02) 0%, transparent 100%)
            `
          }}
        />
        
        {/* Content */}
        <div className="relative z-10 p-6 overflow-y-auto max-h-[90vh]">
          {children}
        </div>
      </div>
    </div>
  );
}
