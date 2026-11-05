// Hand-drawn style food illustrations, shared by the Austin home screen and the
// makeitstretch.org landing page. Decorative only: every SVG is aria-hidden.
// Flat color, one dark outline, rounded joins. No photos of people, no stock art.

const INK = '#2B2B33';
const S = `stroke="${INK}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"`;
const svg = (body, vb = '0 0 120 120') => `<svg viewBox="${vb}" aria-hidden="true" focusable="false">${body}</svg>`;

export const ART = {
  // Grocery bag with bread and greens
  bag: svg(`
    <path d="M44 50c-6-10-4-26 6-34 3 12 2 24-6 34Z" fill="#7FB069" ${S}/>
    <path d="M58 48c0-12 8-22 20-24-2 12-8 20-20 24Z" fill="#9CC97F" ${S}/>
    <rect x="62" y="12" width="14" height="44" rx="7" transform="rotate(18 69 34)" fill="#F2C14E" ${S}/>
    <path d="M66 22l6 3M64 30l6 3M62 38l6 3" ${S} fill="none"/>
    <path d="M28 50h64l-7 54H35Z" fill="#E3AE73" ${S}/>
    <path d="M28 50l5-8h54l5 8" fill="#CF955A" ${S}/>
    <path d="M52 76c0-5 8-5 8 0 0-5 8-5 8 0 0 6-8 10-8 12 0-2-8-6-8-12Z" fill="#C2492F" ${S}/>`),

  // Cooking pot with steam
  pot: svg(`
    <path d="M42 30c-4-6 4-10 0-16M60 28c-4-6 4-10 0-16M78 30c-4-6 4-10 0-16" ${S} fill="none"/>
    <rect x="14" y="56" width="12" height="8" rx="4" fill="#8E3A24" ${S}/>
    <rect x="94" y="56" width="12" height="8" rx="4" fill="#8E3A24" ${S}/>
    <path d="M24 52h72v32a16 16 0 0 1-16 16H40a16 16 0 0 1-16-16Z" fill="#C2492F" ${S}/>
    <rect x="18" y="44" width="84" height="10" rx="5" fill="#E07A5F" ${S}/>
    <path d="M36 72h48" stroke="#F6D7C9" stroke-width="3" stroke-linecap="round"/>`),

  // Phone showing a checked shopping list
  list: svg(`
    <rect x="34" y="10" width="52" height="100" rx="12" fill="#FFFFFF" ${S}/>
    <rect x="50" y="16" width="20" height="4" rx="2" fill="${INK}"/>
    <circle cx="48" cy="38" r="6" fill="#2F8B5C" ${S}/><path d="M45 38l2 2 4-4" stroke="#fff" stroke-width="2.4" fill="none" stroke-linecap="round"/>
    <path d="M60 38h16" ${S}/>
    <circle cx="48" cy="58" r="6" fill="#2F8B5C" ${S}/><path d="M45 58l2 2 4-4" stroke="#fff" stroke-width="2.4" fill="none" stroke-linecap="round"/>
    <path d="M60 58h12" ${S}/>
    <circle cx="48" cy="78" r="6" fill="#FFFFFF" ${S}/>
    <path d="M60 78h16" ${S}/>
    <rect x="42" y="92" width="36" height="8" rx="4" fill="#F2C14E" ${S}/>`),

  // Map pin holding an apple: free food nearby
  pin: svg(`
    <path d="M60 108S28 76 28 50a32 32 0 0 1 64 0c0 26-32 58-32 58Z" fill="#B9B2EE" ${S}/>
    <circle cx="60" cy="50" r="20" fill="#FFFFFF" ${S}/>
    <path d="M60 40c-10-4-16 4-14 12 2 8 8 12 14 9 6 3 12-1 14-9 2-8-4-16-14-12Z" fill="#C2492F" ${S}/>
    <path d="M60 40c0-4 2-7 6-8" ${S} fill="none"/>`),

  // Open food box with cans
  box: svg(`
    <rect x="34" y="26" width="18" height="30" rx="3" fill="#E07A5F" ${S}/>
    <rect x="56" y="20" width="18" height="36" rx="3" fill="#F2C14E" ${S}/>
    <rect x="78" y="30" width="16" height="26" rx="3" fill="#7FB069" ${S}/>
    <path d="M24 52h76v48a6 6 0 0 1-6 6H30a6 6 0 0 1-6-6Z" fill="#E3AE73" ${S}/>
    <path d="M24 52l-8-14h30l8 14M100 52l8-14H78l-8 14" fill="#CF955A" ${S}/>
    <rect x="48" y="70" width="28" height="14" rx="3" fill="#FFFFFF" ${S}/>`),

  // Coins: the budget
  coins: svg(`
    <ellipse cx="60" cy="88" rx="30" ry="10" fill="#E0A93A" ${S}/>
    <path d="M30 88v-10M90 88v-10" ${S}/>
    <ellipse cx="60" cy="78" rx="30" ry="10" fill="#F2C14E" ${S}/>
    <ellipse cx="60" cy="58" rx="30" ry="10" fill="#E0A93A" ${S}/>
    <path d="M30 58v10a30 10 0 0 0 60 0V58" fill="#E0A93A" ${S}/>
    <ellipse cx="60" cy="48" rx="30" ry="10" fill="#F2C14E" ${S}/>
    <path d="M30 48v10M90 48v10" ${S}/>
    <path d="M60 42v12M55 45c0-3 10-3 10 0s-10 3-10 6 10 3 10 0" stroke="${INK}" stroke-width="2.4" fill="none" stroke-linecap="round"/>`),

  sparkle: svg(`<path d="M12 0c1.2 7 4.8 10.8 12 12-7.2 1.2-10.8 5-12 12-1.2-7-4.8-10.8-12-12C7.2 10.8 10.8 7 12 0Z"/>`, '0 0 24 24'),
  squiggle: svg(`<path d="M2 14c10-12 18 10 28 0s18-10 26 0 16 8 24-2" fill="none" stroke-width="3" stroke-linecap="round"/>`, '0 0 84 24'),
};

/** Fill every [data-art="name"] element with its drawing (used by the static landing page). */
export function paintArt(root = document) {
  root.querySelectorAll('[data-art]').forEach(el => { el.innerHTML = ART[el.dataset.art] || ''; });
}
