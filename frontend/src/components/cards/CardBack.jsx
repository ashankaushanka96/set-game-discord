const SIZES = { xs: [32,44], 'sm-xs': [38,52], sm: [44,60], md: [64,88], lg: [96,132] };
export default function CardBack({ size = 'md' }) {
  const [width, height] = SIZES[size] || SIZES.md;
  return <div className="card-back" role="img" aria-label="Face-down card" style={{ width, height }}>
    <div className="card-back__border">
      <span aria-hidden="true">
        <svg viewBox="0 0 24 24" focusable="false">
          <path fill="currentColor" d="M12 2C9 6 3 9 3 13a5 5 0 0 0 8 4c0 2-1 4-3 5h8c-2-1-3-3-3-5a5 5 0 0 0 8-4c0-4-6-7-9-11Z" />
        </svg>
      </span>
    </div>
  </div>;
}
