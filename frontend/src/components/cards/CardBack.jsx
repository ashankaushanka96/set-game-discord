export default function CardBack({ size = "md" }) {
  const sizes = {
    sm: { w: 44, h: 60, r: 8 },
    md: { w: 64, h: 88, r: 10 },
    lg: { w: 96, h: 132, r: 12 },
  };
  const S = sizes[size] || sizes.md;

  return (
    <div
      className="relative bg-gradient-to-br from-blue-900 via-blue-800 to-blue-900 card-shadow"
      style={{
        width: S.w,
        height: S.h,
        borderRadius: S.r,
        border: "2px solid #1e3a8a",
        background: `
          linear-gradient(135deg, #1e3a8a 0%, #1e40af 25%, #1d4ed8 50%, #1e40af 75%, #1e3a8a 100%),
          repeating-linear-gradient(
            45deg,
            transparent,
            transparent 2px,
            rgba(255,255,255,0.1) 2px,
            rgba(255,255,255,0.1) 4px
          )
        `,
      }}
    >
      {/* Card back pattern - classic diamond/rhombus design */}
      <div
        style={{
          position: "absolute",
          inset: 8,
          background: `
            radial-gradient(circle at 30% 30%, rgba(255,255,255,0.2) 0%, transparent 50%),
            radial-gradient(circle at 70% 70%, rgba(255,255,255,0.1) 0%, transparent 50%)
          `,
          borderRadius: S.r - 4,
        }}
      >
        {/* Central diamond pattern */}
        <div
          style={{
            position: "absolute",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            width: S.w * 0.4,
            height: S.h * 0.4,
            background: `
              linear-gradient(45deg, 
                rgba(255,255,255,0.3) 0%, 
                rgba(255,255,255,0.1) 25%, 
                rgba(255,255,255,0.2) 50%, 
                rgba(255,255,255,0.1) 75%, 
                rgba(255,255,255,0.3) 100%
              )
            `,
            clipPath: "polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)",
            border: "1px solid rgba(255,255,255,0.2)",
          }}
        />
        
        {/* Corner decorations */}
        <div
          style={{
            position: "absolute",
            top: 4,
            left: 4,
            width: S.w * 0.15,
            height: S.h * 0.15,
            background: "rgba(255,255,255,0.15)",
            clipPath: "polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)",
          }}
        />
        <div
          style={{
            position: "absolute",
            top: 4,
            right: 4,
            width: S.w * 0.15,
            height: S.h * 0.15,
            background: "rgba(255,255,255,0.15)",
            clipPath: "polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)",
          }}
        />
        <div
          style={{
            position: "absolute",
            bottom: 4,
            left: 4,
            width: S.w * 0.15,
            height: S.h * 0.15,
            background: "rgba(255,255,255,0.15)",
            clipPath: "polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)",
          }}
        />
        <div
          style={{
            position: "absolute",
            bottom: 4,
            right: 4,
            width: S.w * 0.15,
            height: S.h * 0.15,
            background: "rgba(255,255,255,0.15)",
            clipPath: "polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)",
          }}
        />
      </div>
      
      {/* Subtle border highlight */}
      <div
        style={{
          position: "absolute",
          inset: 1,
          borderRadius: S.r - 1,
          border: "1px solid rgba(255,255,255,0.2)",
          pointerEvents: "none",
        }}
      />
    </div>
  );
}
