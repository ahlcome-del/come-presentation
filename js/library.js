/**
 * Library — renders the presentation cards from presentations.json.
 * Adding a presentation = adding one object to presentations.json. Nothing else.
 *
 * Fields: { id, title, subtitle?, years, language, summary, tags[], url, cover?, lang? }
 *  - cover (optional): relative path or URL of an image; otherwise a cover is generated.
 *  - lang  (optional): BCP-47 code of the title; otherwise derived from `language`.
 */

const LANGS = { deutsch: 'de', allemand: 'de', german: 'de', français: 'fr', francais: 'fr', french: 'fr', english: 'en', anglais: 'en', español: 'es', italiano: 'it', latin: 'la' };
const LANG_LABEL_FR = { de: 'allemand', fr: 'français', en: 'anglais', es: 'espagnol', it: 'italien', la: 'latin' };
const SVGNS = 'http://www.w3.org/2000/svg';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const dash = (y) => String(y ?? '').replace(/\s*-\s*/g, '–');          // 1884-1919 -> 1884–1919
const langOf = (p) => p.lang || LANGS[String(p.language || '').toLowerCase()] || 'fr';

/** Deterministic era tint from the first year: older = warmer ochre, recent = cooler slate. */
function eraTint(years) {
  const m = String(years).match(/-?\d{3,4}/);
  const y = m ? parseInt(m[0], 10) : 1800;
  const t = Math.min(1, Math.max(0, (y + 800) / 2800));          // -800 .. 2000
  const hue = 34 - t * 22;                                         // 34° ochre -> 12° umber/brick
  const sat = 22 + (1 - Math.abs(t - .6)) * 10;
  return { a: `hsl(${hue} ${sat}% 24%)`, b: `hsl(${hue + 6} ${sat - 8}% 11%)`, line: `hsl(${hue} 30% 62%)` };
}

/** Procedural SVG cover: tinted gradient, giant years, graticule hairlines, tiny silhouette. */
function coverSVG(p, idx) {
  const t = eraTint(p.years);
  const id = `cv${idx}`;
  const [y1, y2] = dash(p.years).split('–');
  return `
  <svg viewBox="0 0 800 600" xmlns="${SVGNS}" role="img" aria-label="Couverture : ${esc(p.title)}, ${esc(dash(p.years))}" preserveAspectRatio="xMidYMid slice">
    <defs>
      <linearGradient id="${id}g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${t.a}"/><stop offset="1" stop-color="${t.b}"/></linearGradient>
      <radialGradient id="${id}r" cx=".78" cy=".2" r=".9"><stop offset="0" stop-color="#EEE6D4" stop-opacity=".16"/><stop offset=".6" stop-color="#EEE6D4" stop-opacity="0"/></radialGradient>
      <pattern id="${id}p" width="60" height="60" patternUnits="userSpaceOnUse"><path d="M60 0H0V60" fill="none" stroke="${t.line}" stroke-opacity=".10" stroke-width="1"/></pattern>
    </defs>
    <rect width="800" height="600" fill="url(#${id}g)"/>
    <rect width="800" height="600" fill="url(#${id}p)"/>
    <ellipse cx="560" cy="560" rx="520" ry="200" fill="none" stroke="${t.line}" stroke-opacity=".16"/>
    <ellipse cx="560" cy="560" rx="380" ry="140" fill="none" stroke="${t.line}" stroke-opacity=".10"/>
    <rect width="800" height="600" fill="url(#${id}r)"/>
    <text x="44" y="300" font-family="Libre Franklin, sans-serif" font-weight="600" font-size="200" letter-spacing="-12" fill="#EEE6D4" fill-opacity=".92">${esc(y1 || '')}</text>
    <text x="44" y="500" font-family="Libre Franklin, sans-serif" font-weight="300" font-size="200" letter-spacing="-12" fill="#EEE6D4" fill-opacity=".38">${esc(y2 || '')}</text>
    <line x1="48" y1="336" x2="300" y2="336" stroke="#EEE6D4" stroke-opacity=".35"/>
    <circle cx="48" cy="336" r="4" fill="#B9573E"/>
    <svg x="712" y="40" width="44" height="70" viewBox="0 0 1323 2095"><use href="#sil" fill="#EEE6D4" fill-opacity=".75"/></svg>
  </svg>`;
}

const CHEVRON = '<svg viewBox="0 0 7 12" aria-hidden="true"><path d="M1 1l5 5-5 5"/></svg>';

function cardHTML(p, idx) {
  const lang = langOf(p);
  const langAttr = lang !== 'fr' ? ` lang="${esc(lang)}"` : '';
  const cover = p.cover
    ? `<img src="${esc(p.cover)}" alt="Couverture : ${esc(p.title)}" loading="lazy" decoding="async">`
    : coverSVG(p, idx);
  const tags = (p.tags || []).map((t) => `<li>${esc(t)}</li>`).join('');
  const langLabel = LANG_LABEL_FR[lang] ? `En ${LANG_LABEL_FR[lang]}` : esc(p.language || '');
  return `
  <li class="card glass rv-io" data-liquid="card" style="--i:${idx}" id="p-${esc(p.id)}">
    <div class="card__cover">${cover}</div>
    <div class="card__body">
      <p class="card__years"><span class="dot" aria-hidden="true"></span>${esc(dash(p.years))}</p>
      <h3 class="card__title"${langAttr}>${esc(p.title)}</h3>
      ${p.subtitle ? `<p class="card__subtitle"${langAttr}>${esc(p.subtitle)}</p>` : ''}
      <p class="card__summary">${esc(p.summary)}</p>
      ${tags ? `<ul class="card__tags" aria-label="Thèmes">${tags}</ul>` : ''}
      <div class="card__foot">
        <a class="pill glass" href="${esc(p.url)}" target="_blank" rel="noopener noreferrer"
           aria-label="Ouvrir la présentation ${esc(p.title)} (nouvel onglet)">Ouvrir la présentation ${CHEVRON}</a>
        <span class="card__lang">${langLabel}</span>
      </div>
    </div>
  </li>`;
}

function soonHTML(idx) {
  return `
  <li class="card--soon rv-io" style="--i:${idx}" aria-label="Présentation à venir">
    <div class="card__cover"><svg viewBox="0 0 1323 2095" aria-hidden="true"><use href="#sil"/></svg></div>
    <div class="card__body">
      <p class="card__years">Bientôt</p>
      <h3 class="card__title">En préparation</h3>
      <p class="card__summary">Une nouvelle présentation rejoindra bientôt la bibliothèque.</p>
    </div>
  </li>`;
}

export async function renderLibrary(listEl, { placeholders = 2 } = {}) {
  let items = [];
  try {
    const res = await fetch('presentations.json', { cache: 'no-cache' });
    if (!res.ok) throw new Error(res.status);
    items = await res.json();
  } catch (e) {
    console.warn('[library] presentations.json indisponible', e);
  }
  let html = items.map(cardHTML).join('');
  for (let i = 0; i < placeholders; i++) html += soonHTML(items.length + i);
  listEl.innerHTML = html;
  return items;
}
