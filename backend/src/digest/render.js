import { EMAIL_COLORS } from './emailColors.js';
import { plural } from './labels.js';

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
    ...SEGMENTS.flatMap((c) => [
      `.sg-${c}{background:${D[`seg-${c}-bg`]} !important;color:${D[`seg-${c}-fg`]} !important}`,
      `.dot-${c}{background:${D[`seg-${c}-dot`]} !important}`,
    ]),
    `.tg-od{background:${D['overdue-bg']} !important;color:${D['overdue-fg']} !important;border-color:${D['overdue-bg']} !important}`,
    `.tg-ds{background:${D['soon-bg']} !important;color:${D['soon-fg']} !important;border-color:${D['soon-border']} !important}`,
    `.tg-wt{background:${D['waiting-bg']} !important;color:${D['waiting-fg']} !important;border-color:${D['waiting-border']} !important}`,
    `.tg-sn{background:${D['snoozed-bg']} !important;color:${D['snoozed-fg']} !important;border-color:${D['snoozed-border']} !important}`,
    `.tg-ib{background:${D['inbox-bg']} !important;color:${D['inbox-fg']} !important;border-color:${D['inbox-border']} !important}`,
    `.tg-lat{color:${D['ink-2']} !important}`,
  ];
  return `@media (prefers-color-scheme: dark){${rules.join('')}}`;
}

const TAG_BASE = 'display:inline-block;padding:2px 9px;border-radius:12px;font-size:12px;line-height:16px;font-weight:600;white-space:nowrap;';

function tagHtml(tag) {
  if (!tag) return '';
  const label = esc(tag.label);
  switch (tag.kind) {
    case 'overdue':
      return `<span class="tg-od" style="${TAG_BASE}background:${L['overdue-bg']};color:${L['overdue-fg']};border:1px solid ${L['overdue-bg']};">${label}</span>`;
    case 'soon':
      return `<span class="tg-ds" style="${TAG_BASE}background:${L['soon-bg']};color:${L['soon-fg']};border:1px solid ${L['soon-border']};">${label}</span>`;
    case 'waiting':
      return `<span class="tg-wt" style="${TAG_BASE}background:${L['waiting-bg']};color:${L['waiting-fg']};border:1px solid ${L['waiting-border']};">${label}</span>`;
    case 'snoozed':
      return `<span class="tg-sn" style="${TAG_BASE}background:${L['snoozed-bg']};color:${L['snoozed-fg']};border:1px dashed ${L['snoozed-border']};">${label}</span>`;
    case 'inbox':
      return `<span class="tg-ib" style="${TAG_BASE}background:${L['inbox-bg']};color:${L['inbox-fg']};border:1px dotted ${L['inbox-border']};">${label}</span>`;
    default:
      return `<span class="tg-lat" style="${TAG_BASE}color:${L['ink-2']};padding-left:0;font-weight:500;">${label}</span>`;
  }
}

function dotHtml(color) {
  return `<span class="dot-${color}" style="display:inline-block;width:8px;height:8px;border-radius:2px;background:${L[`seg-${color}-dot`]};margin-right:6px"></span>`;
}

function chipHtml(segment) {
  if (!segment || !SEGMENTS.includes(segment.color)) return '';
  return `<span class="sg-${segment.color}" style="display:inline-block;padding:2px 9px 2px 8px;border-radius:6px;background:${L[`seg-${segment.color}-bg`]};color:${L[`seg-${segment.color}-fg`]};font-size:12px;line-height:16px;font-weight:600;white-space:nowrap">${dotHtml(segment.color)}${esc(segment.name)}</span>`;
}

const SECTION_HEAD = `font-size:12px;line-height:16px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:${L['ink-3']};padding-bottom:4px;`;

function itemRow(item, model, last) {
  const by = item.creator ? `&nbsp;&nbsp;<span class="em-ink2" style="color:${L['ink-2']}">by ${esc(item.creator)}</span>` : '';
  return `<tr><td class="em-bd" style="padding:14px 0;${last ? '' : `border-bottom:1px solid ${L.border};`}"><a class="em-ink" href="${esc(model.links.item(item.id))}" style="font-size:16px;line-height:22px;font-weight:600;color:${L.ink};text-decoration:none">${esc(item.title)}</a><div style="padding-top:6px;font-size:12px;line-height:16px">${chipHtml(item.segment)}&nbsp;&nbsp;${tagHtml(item.tag)}${by}</div></td></tr>`;
}

function section(title, items, more, model) {
  if (!items.length) return '';
  const rows = items.map((item, i) => itemRow(item, model, i === items.length - 1 && !more)).join('');
  const moreRow = more
    ? `<tr><td style="padding:12px 0 0 0;font-size:13px;line-height:18px"><a class="em-ink2" href="${esc(model.links.app)}" style="color:${L['ink-2']}">+ ${more} more in RADAR</a></td></tr>`
    : '';
  return `<tr><td style="padding:24px 32px 0 32px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td class="em-ink3 em-bd" style="${SECTION_HEAD}border-bottom:1px solid ${L.border}">${title}</td></tr>${rows}${moreRow}</table></td></tr>`;
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
  return `<tr><td style="padding:28px 32px 0 32px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td class="em-ink3 em-bd" style="${SECTION_HEAD}border-bottom:1px dashed ${L.border}">Next up &middot; next week</td></tr>${rows}</table></td></tr>`;
}

function inboxCard(model) {
  if (!model.inboxCount) return '';
  return `<tr><td style="padding:20px 32px 0 32px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="em-card2" bgcolor="${L['surface-2']}" style="background:${L['surface-2']};border:1px solid ${L.border};border-radius:10px"><tr><td class="em-ink" style="padding:12px 16px;font-size:15px;line-height:22px;color:${L.ink}"><strong>Inbox</strong> &middot; <span class="em-ink2" style="color:${L['ink-2']}">${plural(model.inboxCount, 'item')} to sort</span></td><td align="right" style="padding:12px 16px"><a class="em-ink" href="${esc(model.links.inbox)}" style="font-size:14px;font-weight:600;color:${L.ink};text-decoration:underline">Sort now</a></td></tr></table></td></tr>`;
}

function openButton(model) {
  return `<tr><td style="padding:24px 32px 0 32px"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td class="em-btn" bgcolor="${L.primary}" style="border-radius:8px;background:${L.primary}"><a class="em-btntext" href="${esc(model.links.app)}" style="display:inline-block;padding:13px 24px;font-size:15px;line-height:20px;font-weight:600;color:${L['on-primary']};text-decoration:none">Open RADAR</a></td></tr></table></td></tr>`;
}

function looseEndsBlock(model) {
  const { waiting, inboxCount } = model.looseEnds;
  const lines = [];
  if (waiting.length === 1) {
    const w = waiting[0];
    lines.push(`One loose end: <a class="em-ink" href="${esc(model.links.item(w.id))}" style="color:${L.ink};font-weight:600">${esc(w.title)}</a> has been waiting ${plural(w.days, 'day')}.`);
  } else if (waiting.length > 1) {
    lines.push(`${waiting.length} things you’re waiting on could use a nudge. <a class="em-ink" href="${esc(model.links.app)}" style="color:${L.ink};font-weight:600">See them in RADAR</a>.`);
  }
  if (inboxCount > 0) {
    lines.push(`${plural(inboxCount, 'item')} ${inboxCount === 1 ? 'is' : 'are'} in your <a class="em-ink" href="${esc(model.links.inbox)}" style="color:${L.ink};font-weight:600">Inbox</a> whenever you want to sort ${inboxCount === 1 ? 'it' : 'them'}.`);
  }
  if (!lines.length) return '';
  return `<tr><td style="padding:24px 32px 0 32px"><div class="em-ink2" style="font-size:14px;line-height:22px;color:${L['ink-2']}">${lines.join('<br>')}</div></td></tr>`;
}

function header(model) {
  return `<tr><td style="padding:24px 32px 0 32px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="font-size:14px;line-height:20px;font-weight:700;letter-spacing:.14em;color:${L.ink}" class="em-ink"><span class="em-ring" style="display:inline-block;width:12px;height:12px;border:2.5px solid ${L.ink};border-radius:50%;vertical-align:-2px;margin-right:8px"></span>RADAR</td><td align="right" class="em-ink3" style="font-size:13px;line-height:18px;color:${L['ink-3']}">${esc(model.dateLabel)}</td></tr></table></td></tr>`;
}

function footer(model) {
  const f = model.footer;
  return `<tr><td style="padding:32px 32px 28px 32px"><div class="em-ink3 em-bd" style="font-size:12px;line-height:18px;color:${L['ink-3']};border-top:1px solid ${L.border};padding-top:16px">Sent to ${esc(f.email)} for ${esc(f.household)}.<br>You get this email at ${esc(f.sendLabel)}. <a class="em-ink2" href="${esc(model.links.settings)}" style="color:${L['ink-2']}">Change the time or turn it off in Settings</a>.</div></td></tr>`;
}

function bodyNormal(model) {
  return [
    `<tr><td style="padding:24px 32px 0 32px"><div class="em-ink" style="font-size:24px;line-height:30px;font-weight:600;color:${L.ink}">${esc(model.greeting)}, ${esc(model.name)}.</div><div class="em-ink2" style="padding-top:6px;font-size:15px;line-height:22px;color:${L['ink-2']}">${esc(model.intro)}</div></td></tr>`,
    section(`Overdue &middot; ${model.overdue.length + model.overdueMore}`, model.overdue, model.overdueMore, model),
    section('Due this week &middot; ends Saturday', model.thisWeek, model.thisWeekMore, model),
    section(`Waiting &middot; ${model.waiting.length + model.waitingMore}`, model.waiting, model.waitingMore, model),
    inboxCard(model),
    openButton(model),
    nextWeekBlock(model),
  ].join('');
}

function bodyEmpty(model) {
  return [
    `<tr><td style="padding:24px 32px 0 32px"><div class="em-ink" style="font-size:24px;line-height:30px;font-weight:600;color:${L.ink}">${esc(model.greeting)}, ${esc(model.name)}.</div></td></tr>`,
    `<tr><td style="padding:12px 32px 0 32px"><div class="em-ink2" style="font-size:20px;line-height:28px;color:${L['ink-2']}">Nothing on the list today. Enjoy the day.</div></td></tr>`,
    looseEndsBlock(model),
    `<tr><td style="padding:20px 32px 0 32px"><a class="em-ink" href="${esc(model.links.app)}" style="font-size:14px;font-weight:600;color:${L.ink};text-decoration:underline">Open RADAR</a></td></tr>`,
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
    `<tr><td style="padding:32px 32px 0 32px"><table role="presentation" cellpadding="0" cellspacing="0" border="0" align="left"><tr><td align="center" style="width:84px;height:84px;border:3px solid ${L.ink};border-radius:50%;font-size:40px;line-height:78px;color:${L.ink};font-weight:300" class="em-ring-box">&#10003;</td></tr></table></td></tr>`,
    `<tr><td style="padding:24px 32px 0 32px"><div class="em-ink" style="font-size:40px;line-height:44px;font-weight:600;letter-spacing:-.01em;color:${L.ink}">All clear.</div><div class="em-ink2" style="padding-top:10px;font-size:18px;line-height:27px;color:${L['ink-2']}">You’re all caught up, ${esc(model.name)}. Nothing overdue and nothing left to do before the week ends. That’s a good week.</div></td></tr>`,
    `<tr><td style="padding:28px 32px 0 32px"><div class="em-ink3 em-bd" style="${SECTION_HEAD}border-bottom:1px solid ${L.border}">You finished this week</div><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${done}${more}</table></td></tr>`,
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
${darkCss()}
</style>
</head>
<body style="margin:0;padding:0">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="em-page" bgcolor="${L.bg}" style="background:${L.bg}"><tr><td align="center" style="padding:24px 12px"><div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">${esc(model.preheader)}</div><table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" class="em-card" bgcolor="${L.surface}" style="width:100%;max-width:600px;background:${L.surface};border:1px solid ${L.border};border-radius:16px;font-family:${FONT};color:${L.ink}">${header(model)}${body}${footer(model)}</table></td></tr></table>
</body>
</html>
`;
}

function textItem(item, model) {
  const parts = [item.segment ? `[${item.segment.name}]` : null, item.tag?.label, item.creator ? `by ${item.creator}` : null].filter(Boolean);
  return `- ${item.title}${parts.length ? ` ${parts.join(' · ')}` : ''}\n  ${model.links.item(item.id)}`;
}

function textSection(title, items, more, model) {
  if (!items.length) return [];
  const lines = [title, ...items.map((i) => textItem(i, model))];
  if (more) lines.push(`+ ${more} more in RADAR: ${model.links.app}`);
  return [...lines, ''];
}

function textLoose(model) {
  const { waiting, inboxCount } = model.looseEnds;
  const lines = [];
  if (waiting.length === 1) lines.push(`One loose end: ${waiting[0].title} has been waiting ${plural(waiting[0].days, 'day')}. ${model.links.item(waiting[0].id)}`);
  else if (waiting.length > 1) lines.push(`${waiting.length} things you’re waiting on could use a nudge: ${model.links.app}`);
  if (inboxCount > 0) lines.push(`${plural(inboxCount, 'item')} ${inboxCount === 1 ? 'is' : 'are'} in your Inbox whenever you want to sort ${inboxCount === 1 ? 'it' : 'them'}. ${model.links.inbox}`);
  return lines.length ? [...lines, ''] : [];
}

export function renderText(model) {
  const out = [`Subject: ${model.subject}`, `Preheader: ${model.preheader}`, '', `RADAR · ${model.dateLabel}`, ''];
  if (model.variant === 'normal') {
    out.push(`${model.greeting}, ${model.name}.`, model.intro, '');
    out.push(...textSection(`OVERDUE (${model.overdue.length + model.overdueMore})`, model.overdue, model.overdueMore, model));
    out.push(...textSection('DUE THIS WEEK (ends Saturday)', model.thisWeek, model.thisWeekMore, model));
    out.push(...textSection(`WAITING (${model.waiting.length + model.waitingMore})`, model.waiting, model.waitingMore, model));
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
  const f = model.footer;
  out.push('--', `Sent to ${f.email} for ${f.household}.`, `You get this email at ${f.sendLabel}. Change the time or turn it off in Settings: ${model.links.settings}`);
  return `${out.join('\n')}\n`;
}

export function renderEmail(model) {
  return { subject: model.subject, html: renderHtml(model), text: renderText(model) };
}
