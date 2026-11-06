import { EMAIL_COLORS } from './emailColors.js';
import { joinNames, plural } from './labels.js';

const L = EMAIL_COLORS.light;
const D = EMAIL_COLORS.dark;
const FONT = "'IBM Plex Sans',-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif";
const SEGMENTS = ['emerald', 'rose', 'blue', 'violet', 'slate', 'teal', 'lime', 'indigo', 'magenta', 'brown', 'sky', 'stone'];

export function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Mail apps that follow the phone's dark mode use these; the rest keep the inline light colors.
function darkCss() {
  const rules = [
    `.em-page{background:${D.bg} !important}`,
    `.em-card{background:${D.surface} !important;border-color:${D.border} !important}`,
    `.em-card2{background:${D['surface-2']} !important;border-color:${D.border} !important}`,
    `.em-ink{color:${D.ink} !important}`,
    `.em-ink2{color:${D['ink-2']} !important}`,
    `.em-ink3{color:${D['ink-3']} !important}`,
    `.em-bd{border-color:${D.border} !important}`,
    `.em-btn{background:${D.primary} !important}`,
    `.em-btntext{color:${D['on-primary']} !important}`,
    `.em-ring{border-color:${D.ink} !important}`,
    `.em-ring-box{border-color:${D.ink} !important;color:${D.ink} !important}`,
    `.tn-late{color:${D['overdue-bg']} !important}`,
    `.tn-plain{color:${D['ink-2']} !important}`,
    `.tn-soon{color:${D['soon-fg']} !important}`,
    `.hd-late{color:${D['overdue-bg']} !important}`,
    ...SEGMENTS.map((c) => `.bl-${c}{border-left-color:${D[`seg-${c}-dot`]} !important}`),
    ...SEGMENTS.map((c) => `.dot-${c}{background:${D[`seg-${c}-dot`]} !important}`),
  ];
  return `@media (prefers-color-scheme: dark){${rules.join('')}}`;
}

function dotHtml(color) {
  return `<span class="dot-${color}" style="display:inline-block;width:8px;height:8px;border-radius:2px;background:${L[`seg-${color}-dot`]};margin-right:6px"></span>`;
}

const SECTION_HEAD = `font-size:12px;line-height:16px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:${L['ink-3']};padding-bottom:6px;`;
const TONE_COLOR = { late: L['overdue-bg'], soon: L['soon-fg'], plain: L['ink-2'] };

// One row: a left border in the segment's color, the title (and a small line under it for follow-ups),
// the segment's name in small type, and a short label on the right. On a narrow phone the segment name moves under the title.
function itemRow(item, model, last) {
  const color = item.segment && SEGMENTS.includes(item.segment.color) ? item.segment.color : 'slate';
  const bar = L[`seg-${color}-dot`];
  const seg = item.segment ? esc(item.segment.name) : 'Unsorted';
  const tone = TONE_COLOR[item.tone] ?? TONE_COLOR.plain;
  const strong = item.tone === 'plain' ? 500 : 700;
  const sub = item.sub ? `<div class="em-ink2" style="padding-top:2px;font-size:12px;line-height:17px;color:${L['ink-2']}">${esc(item.sub)}</div>` : '';
  const inline = `<div class="em-seginline em-ink3" style="display:none;padding-top:2px;font-size:11px;line-height:15px;color:${L['ink-3']}">${seg}</div>`;
  return `<tr><td class="bl-${color} em-bd" style="padding:0;border-left:4px solid ${bar};${last ? '' : `border-bottom:1px solid ${L.border};`}"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="padding:10px 8px 10px 12px;vertical-align:top"><a class="em-ink" href="${esc(model.links.item(item.id))}" style="font-size:15px;line-height:21px;font-weight:600;color:${L.ink};text-decoration:none">${esc(item.title)}</a>${sub}${inline}</td><td class="em-segcol em-ink3" width="92" style="width:92px;padding:11px 8px 10px 0;vertical-align:top;font-size:11px;line-height:15px;color:${L['ink-3']}">${seg}</td><td class="tn-${item.tone}" width="84" align="right" style="width:84px;padding:11px 12px 10px 0;vertical-align:top;text-align:right;font-size:12px;line-height:17px;font-weight:${strong};color:${tone};white-space:nowrap">${esc(item.label)}</td></tr></table></td></tr>`;
}

function section(title, items, more, model, { late = false } = {}) {
  if (!items.length) return '';
  const rows = items.map((item, i) => itemRow(item, model, i === items.length - 1 && !more)).join('');
  const moreRow = more
    ? `<tr><td style="padding:10px 0 0 12px;font-size:13px;line-height:18px"><a class="em-ink2" href="${esc(model.links.app)}" style="color:${L['ink-2']}">+ ${more} more in RADAR</a></td></tr>`
    : '';
  return `<tr><td class="em-pad" style="padding:22px 32px 0 32px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td class="${late ? 'hd-late' : 'em-ink3'} em-bd" style="${SECTION_HEAD}${late ? `color:${L['overdue-bg']};` : ''}border-bottom:1px solid ${L.border}">${title}</td></tr>${rows}${moreRow}</table></td></tr>`;
}

function followUpSection(source, model) {
  const { followUps, followUpsMore } = source;
  return section(`Follow-up needed &middot; ${followUps.length + followUpsMore}`, followUps, followUpsMore, model);
}

function nextWeekBlock(model) {
  if (!model.nextWeek?.length) return '';
  const rows = model.nextWeek
    .map(
      (n) =>
        `<tr><td class="em-ink3" style="padding:7px 0;font-size:13px;line-height:18px;color:${L['ink-3']}"><span style="display:inline-block;width:36px;font-weight:600">${esc(n.dayLabel)}</span><a class="em-ink3" href="${esc(model.links.item(n.id))}" style="color:${L['ink-3']};text-decoration:none">${esc(n.title)}</a>${
          n.segment ? `<span style="float:right">${dotHtml(n.segment.color)}${esc(n.segment.shortName)}</span>` : ''
        }</td></tr>`
    )
    .join('');
  return `<tr><td class="em-pad" style="padding:28px 32px 0 32px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td class="em-ink3 em-bd" style="${SECTION_HEAD}border-bottom:1px dashed ${L.border}">Next up &middot; next week</td></tr>${rows}</table></td></tr>`;
}

function inboxCard(model) {
  if (!model.inboxCount) return '';
  return `<tr><td class="em-pad" style="padding:20px 32px 0 32px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="em-card2" bgcolor="${L['surface-2']}" style="background:${L['surface-2']};border:1px solid ${L.border};border-radius:10px"><tr><td class="em-ink" style="padding:12px 16px;font-size:15px;line-height:22px;color:${L.ink}"><strong>Inbox</strong> &middot; <span class="em-ink2" style="color:${L['ink-2']}">${plural(model.inboxCount, 'item')} to sort</span></td><td align="right" style="padding:12px 16px"><a class="em-ink" href="${esc(model.links.inbox)}" style="font-size:14px;font-weight:600;color:${L.ink};text-decoration:underline">Sort now</a></td></tr></table></td></tr>`;
}

function openButton(model) {
  return `<tr><td class="em-pad" style="padding:24px 32px 0 32px"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td class="em-btn" bgcolor="${L.primary}" style="border-radius:8px;background:${L.primary}"><a class="em-btntext" href="${esc(model.links.app)}" style="display:inline-block;padding:13px 24px;font-size:15px;line-height:20px;font-weight:600;color:${L['on-primary']};text-decoration:none">Open RADAR</a></td></tr></table></td></tr>`;
}

function looseEndsBlock(model) {
  const { inboxCount } = model.looseEnds;
  const followUps = followUpSection(model.looseEnds, model);
  const inbox =
    inboxCount > 0
      ? `<tr><td class="em-pad" style="padding:20px 32px 0 32px"><div class="em-ink2" style="font-size:14px;line-height:22px;color:${L['ink-2']}">${plural(inboxCount, 'item')} ${inboxCount === 1 ? 'is' : 'are'} in your <a class="em-ink" href="${esc(model.links.inbox)}" style="color:${L.ink};font-weight:600">Inbox</a> whenever you want to sort ${inboxCount === 1 ? 'it' : 'them'}.</div></td></tr>`
      : '';
  return followUps + inbox;
}

// A quiet line at the bottom: which shopping lists are still open. Names only, no items.
function shoppingNote(model) {
  const s = model.shopping;
  if (!s) return '';
  const link = (name) => `<a class="em-ink2" href="${esc(model.links.shopping)}" style="color:${L['ink-2']};text-decoration:underline">${esc(name)}</a>`;
  const names = [...s.names.map(link), ...(s.more ? [`${s.more} more`] : [])];
  return `<tr><td class="em-pad" style="padding:22px 32px 0 32px"><div class="em-ink3" style="font-size:13px;line-height:20px;color:${L['ink-3']}">${esc(s.lead)} ${joinNames(names)}.</div></td></tr>`;
}

function header(model) {
  return `<tr><td class="em-pad" style="padding:24px 32px 0 32px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="font-size:14px;line-height:20px;font-weight:700;letter-spacing:.14em;color:${L.ink}" class="em-ink"><span class="em-ring" style="display:inline-block;width:12px;height:12px;border:2.5px solid ${L.ink};border-radius:50%;vertical-align:-2px;margin-right:8px"></span>RADAR</td><td align="right" class="em-ink3" style="font-size:13px;line-height:18px;color:${L['ink-3']}">${esc(model.dateLabel)}</td></tr></table></td></tr>`;
}

function footer(model) {
  const f = model.footer;
  return `<tr><td class="em-pad" style="padding:32px 32px 28px 32px"><div class="em-ink3 em-bd" style="font-size:12px;line-height:18px;color:${L['ink-3']};border-top:1px solid ${L.border};padding-top:16px">Sent to ${esc(f.email)} for ${esc(f.household)}.<br>${f.sendCount > 1 ? 'You get these emails' : 'You get this email'} at ${esc(f.sendLabel)}. <a class="em-ink2" href="${esc(model.links.settings)}" style="color:${L['ink-2']}">Change the time or turn it off in Settings</a>.</div></td></tr>`;
}

function bodyNormal(model) {
  return [
    `<tr><td class="em-pad" style="padding:24px 32px 0 32px"><div class="em-ink" style="font-size:24px;line-height:30px;font-weight:600;color:${L.ink}">${esc(model.greeting)}, ${esc(model.name)}.</div><div class="em-ink2" style="padding-top:6px;font-size:15px;line-height:22px;color:${L['ink-2']}">${esc(model.intro)}</div></td></tr>`,
    section(`Overdue &middot; ${model.overdue.length + model.overdueMore}`, model.overdue, model.overdueMore, model, { late: true }),
    section(`Due this week &middot; ${model.thisWeek.length + model.thisWeekMore}`, model.thisWeek, model.thisWeekMore, model),
    followUpSection(model, model),
    inboxCard(model),
    openButton(model),
    nextWeekBlock(model),
  ].join('');
}

function bodyEmpty(model) {
  return [
    `<tr><td class="em-pad" style="padding:24px 32px 0 32px"><div class="em-ink" style="font-size:24px;line-height:30px;font-weight:600;color:${L.ink}">${esc(model.greeting)}, ${esc(model.name)}.</div></td></tr>`,
    `<tr><td class="em-pad" style="padding:12px 32px 0 32px"><div class="em-ink2" style="font-size:20px;line-height:28px;color:${L['ink-2']}">Nothing on the list today. Enjoy the day.</div></td></tr>`,
    looseEndsBlock(model),
    `<tr><td class="em-pad" style="padding:20px 32px 0 32px"><a class="em-ink" href="${esc(model.links.app)}" style="font-size:14px;font-weight:600;color:${L.ink};text-decoration:underline">Open RADAR</a></td></tr>`,
  ].join('');
}

function bodyAllClear(model) {
  const done = model.finished.titles
    .map((t) => `<tr><td class="em-ink2" style="padding:5px 0;font-size:14px;line-height:20px;color:${L['ink-2']}">&#10003;&nbsp;&nbsp;${esc(t)}</td></tr>`)
    .join('');
  const more = model.finished.more
    ? `<tr><td class="em-ink2" style="padding:5px 0;font-size:14px;line-height:20px;color:${L['ink-2']}">&#10003;&nbsp;&nbsp;+ ${model.finished.more} more</td></tr>`
    : '';
  return [
    `<tr><td class="em-pad" style="padding:32px 32px 0 32px"><table role="presentation" cellpadding="0" cellspacing="0" border="0" align="left"><tr><td align="center" style="width:84px;height:84px;border:3px solid ${L.ink};border-radius:50%;font-size:40px;line-height:78px;color:${L.ink};font-weight:300" class="em-ring-box">&#10003;</td></tr></table></td></tr>`,
    `<tr><td class="em-pad" style="padding:24px 32px 0 32px"><div class="em-ink" style="font-size:40px;line-height:44px;font-weight:600;letter-spacing:-.01em;color:${L.ink}">All clear.</div><div class="em-ink2" style="padding-top:10px;font-size:18px;line-height:27px;color:${L['ink-2']}">You’re all caught up, ${esc(model.name)}. Nothing overdue and nothing left to do before the week ends. That’s a good week.</div></td></tr>`,
    `<tr><td class="em-pad" style="padding:28px 32px 0 32px"><div class="em-ink3 em-bd" style="${SECTION_HEAD}border-bottom:1px solid ${L.border}">You finished this week</div><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${done}${more}</table></td></tr>`,
    looseEndsBlock(model),
  ].join('');
}

export function renderHtml(model) {
  const body = model.variant === 'normal' ? bodyNormal(model) : model.variant === 'allclear' ? bodyAllClear(model) : bodyEmpty(model);
  return `<!doctype html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<title>${esc(model.subject)}</title>
<style>
:root{color-scheme:light dark;supported-color-schemes:light dark}
body{margin:0;padding:0}
a{color:inherit}
@media only screen and (max-width:480px){.em-pad{padding-left:16px !important;padding-right:16px !important}.em-segcol{display:none !important}.em-seginline{display:block !important}}
${darkCss()}
</style>
</head>
<body style="margin:0;padding:0">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="em-page" bgcolor="${L.bg}" style="background:${L.bg}"><tr><td align="center" style="padding:24px 12px"><div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">${esc(model.preheader)}</div><table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" class="em-card" bgcolor="${L.surface}" style="width:100%;max-width:600px;background:${L.surface};border:1px solid ${L.border};border-radius:16px;font-family:${FONT};color:${L.ink}">${header(model)}${body}${shoppingNote(model)}${footer(model)}</table></td></tr></table>
</body>
</html>
`;
}

function textItem(item, model) {
  const parts = [item.segment ? item.segment.name : 'Unsorted', item.label].filter(Boolean);
  return `- ${item.title} — ${parts.join(' — ')}${item.sub ? `\n  ${item.sub}` : ''}\n  ${model.links.item(item.id)}`;
}

function textSection(title, items, more, model) {
  if (!items.length) return [];
  const lines = [title, ...items.map((i) => textItem(i, model))];
  if (more) lines.push(`+ ${more} more in RADAR: ${model.links.app}`);
  return [...lines, ''];
}

function textFollowUps(source, model) {
  return textSection(`FOLLOW-UP NEEDED (${source.followUps.length + source.followUpsMore})`, source.followUps, source.followUpsMore, model);
}

function textLoose(model) {
  const { inboxCount } = model.looseEnds;
  const lines = textFollowUps(model.looseEnds, model);
  if (inboxCount > 0) lines.push(`${plural(inboxCount, 'item')} ${inboxCount === 1 ? 'is' : 'are'} in your Inbox whenever you want to sort ${inboxCount === 1 ? 'it' : 'them'}. ${model.links.inbox}`, '');
  return lines;
}

export function renderText(model) {
  const out = [`Subject: ${model.subject}`, `Preheader: ${model.preheader}`, '', `RADAR · ${model.dateLabel}`, ''];
  if (model.variant === 'normal') {
    out.push(`${model.greeting}, ${model.name}.`, model.intro, '');
    out.push(...textSection(`OVERDUE (${model.overdue.length + model.overdueMore})`, model.overdue, model.overdueMore, model));
    out.push(...textSection(`DUE THIS WEEK (${model.thisWeek.length + model.thisWeekMore})`, model.thisWeek, model.thisWeekMore, model));
    out.push(...textFollowUps(model, model));
    if (model.inboxCount) out.push('INBOX', `${plural(model.inboxCount, 'item')} to sort: ${model.links.inbox}`, '');
    out.push(`Open RADAR: ${model.links.app}`, '');
    if (model.nextWeek.length) {
      out.push('NEXT UP · NEXT WEEK');
      for (const n of model.nextWeek) out.push(`${n.dayLabel.padEnd(5)}${n.title}${n.segment ? ` [${n.segment.shortName}]` : ''}`);
      out.push('');
    }
  } else if (model.variant === 'allclear') {
    out.push('ALL CLEAR.', '', `You’re all caught up, ${model.name}. Nothing overdue and nothing left to do before the week ends. That’s a good week.`, '');
    out.push('YOU FINISHED THIS WEEK', ...model.finished.titles.map((t) => `- ${t}`));
    if (model.finished.more) out.push(`- + ${model.finished.more} more`);
    out.push('', ...textLoose(model));
  } else {
    out.push(`${model.greeting}, ${model.name}.`, '', 'Nothing on the list today. Enjoy the day.', '', ...textLoose(model), `Open RADAR: ${model.links.app}`, '');
  }
  if (model.shopping) {
    const s = model.shopping;
    out.push(`${s.lead} ${joinNames([...s.names, ...(s.more ? [`${s.more} more`] : [])])}. ${model.links.shopping}`, '');
  }
  const f = model.footer;
  out.push('--', `Sent to ${f.email} for ${f.household}.`, `${f.sendCount > 1 ? 'You get these emails' : 'You get this email'} at ${f.sendLabel}. Change the time or turn it off in Settings: ${model.links.settings}`);
  return `${out.join('\n')}\n`;
}

export function renderEmail(model) {
  return { subject: model.subject, html: renderHtml(model), text: renderText(model) };
}
