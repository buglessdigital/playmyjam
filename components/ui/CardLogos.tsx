// Tosla web sitesi gereksinimi: Visa / Mastercard / Troy logolarından en az biri
// sitede görünür olmalı. Üçü de sade beyaz-zemin rozetler halinde gösterilir.
export default function CardLogos({ className = "" }: { className?: string }) {
  return (
    <div className={`flex items-center gap-2 ${className}`} aria-label="Kabul edilen kartlar">
      {/* Visa */}
      <span className="flex h-7 w-11 items-center justify-center rounded-md bg-white">
        <svg width="34" height="12" viewBox="0 0 1000 324" aria-label="Visa">
          <path
            fill="#1434CB"
            d="M651.19.5c-70.933 0-134.322 36.766-134.322 104.694 0 77.9 112.423 83.281 112.423 122.415 0 16.478-18.884 31.229-51.137 31.229-45.773 0-79.984-20.611-79.984-20.611l-14.638 68.547s39.41 17.41 91.734 17.41c77.552 0 138.576-38.572 138.576-107.66 0-82.316-112.89-87.537-112.89-123.86 0-12.908 15.502-27.052 47.663-27.052 36.286 0 65.892 14.99 65.892 14.99l14.326-66.204S696.617.5 651.19.5zM2.218 5.497L.5 15.49s29.842 5.461 56.719 16.356c34.606 12.492 37.072 19.765 42.9 42.354l63.51 244.832h85.137L379.927 5.497h-84.942L210.7 218.67l-34.39-180.696c-3.154-20.68-19.13-32.477-38.684-32.477H2.218zm411.865 0l-66.634 313.535h80.999l66.4-313.535h-80.765zm451.759 0c-19.532 0-29.88 10.457-37.474 28.73L709.699 319.032h84.942l16.434-47.467h103.483l9.993 47.467H999.5L934.115 5.497h-68.273zm11.047 84.707l25.178 117.653h-67.454l42.276-117.653z"
          />
        </svg>
      </span>
      {/* Mastercard */}
      <span className="flex h-7 w-11 items-center justify-center rounded-md bg-white">
        <svg width="26" height="16" viewBox="0 0 152.4 108" aria-label="Mastercard">
          <rect x="60.4" y="25.7" width="31.5" height="56.6" fill="#ff5f00" />
          <path
            d="M62.4 54a35.9 35.9 0 0 1 13.7-28.3 36 36 0 1 0 0 56.6A35.9 35.9 0 0 1 62.4 54z"
            fill="#eb001b"
          />
          <path
            d="M134.4 54a36 36 0 0 1-58.3 28.3 36 36 0 0 0 0-56.6A36 36 0 0 1 134.4 54z"
            fill="#f79e1b"
          />
        </svg>
      </span>
      {/* Troy */}
      <span className="flex h-7 w-11 items-center justify-center rounded-md bg-white">
        <svg width="30" height="12" viewBox="0 0 60 20" aria-label="Troy">
          <text
            x="30"
            y="15"
            textAnchor="middle"
            fontFamily="Arial, Helvetica, sans-serif"
            fontSize="15"
            fontWeight="bold"
            fontStyle="italic"
            fill="#0f2b4c"
          >
            troy
          </text>
        </svg>
      </span>
    </div>
  );
}
