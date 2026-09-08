#!/usr/bin/env node
/**
 * 노션 → 깃허브 docs 동기화 — 2026-09-08 (지시어② notion-sync.js)
 *   GitHub Actions(docs-sync.yml)가 돌린다. PC 불필요. 의존 패키지 0개(Node 20 내장 fetch).
 *   노션 DB에서 Status = Published 인 페이지를 docs/<slug>.md 로 내려쓴다(Front Matter 포함).
 *
 *   필요한 비밀값(깃허브 저장소 Settings → Secrets → Actions):
 *     NOTION_TOKEN        노션 통합(integration) 토큰 — DB 를 그 통합에 연결해 둘 것
 *     NOTION_DATABASE_ID  노션 데이터베이스 ID(32자)
 *   비밀값이 없으면 아무것도 하지 않고 정상 종료한다(빌드를 깨지 않는다).
 *
 *   선택 환경변수: NOTION_STATUS_PROP(기본 'Status'), NOTION_STATUS_VALUE(기본 'Published'), DOCS_DIR(기본 'docs')
 */
'use strict';
const fs = require('fs'), path = require('path');
const TOKEN = process.env.NOTION_TOKEN || '', DB = process.env.NOTION_DATABASE_ID || '';
const STATUS_PROP = process.env.NOTION_STATUS_PROP || 'Status', STATUS_VALUE = process.env.NOTION_STATUS_VALUE || 'Published';
const DOCS = process.env.DOCS_DIR || 'docs';
const NV = '2022-06-28';
if (!TOKEN || !DB) { console.log('NOTION_TOKEN / NOTION_DATABASE_ID 가 없어 동기화를 건너뜁니다(정상 종료)'); process.exit(0); }

async function api(url, body) {
  const r = await fetch('https://api.notion.com/v1/' + url, { method: body ? 'POST' : 'GET', headers: { Authorization: 'Bearer ' + TOKEN, 'Notion-Version': NV, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  if (!r.ok) throw new Error(url + ' → ' + r.status + ' ' + (await r.text()).slice(0, 300));
  return r.json();
}
const rich = arr => (arr || []).map(t => {
  let s = t.plain_text || '';
  const a = t.annotations || {};
  if (a.code) s = '`' + s + '`';
  if (a.bold) s = '**' + s + '**';
  if (a.italic) s = '_' + s + '_';
  if (a.strikethrough) s = '~~' + s + '~~';
  if (t.href) s = '[' + s + '](' + t.href + ')';
  return s;
}).join('');
const propText = p => {
  if (!p) return '';
  if (p.type === 'title') return rich(p.title);
  if (p.type === 'rich_text') return rich(p.rich_text);
  if (p.type === 'select') return p.select ? p.select.name : '';
  if (p.type === 'status') return p.status ? p.status.name : '';
  if (p.type === 'multi_select') return p.multi_select.map(x => x.name).join(', ');
  if (p.type === 'date') return p.date ? p.date.start : '';
  if (p.type === 'url') return p.url || '';
  if (p.type === 'number') return p.number == null ? '' : String(p.number);
  if (p.type === 'checkbox') return p.checkbox ? 'true' : 'false';
  return '';
};
async function blocksToMd(blockId, depth) {
  let out = [], cursor;
  do {
    const r = await api('blocks/' + blockId + '/children?page_size=100' + (cursor ? '&start_cursor=' + cursor : ''));
    for (const b of r.results) {
      const t = b.type, v = b[t] || {}, ind = '  '.repeat(depth || 0);
      let line = '';
      if (t === 'paragraph') line = rich(v.rich_text);
      else if (/^heading_(\d)$/.test(t)) line = '#'.repeat(Number(t.slice(-1))) + ' ' + rich(v.rich_text);
      else if (t === 'bulleted_list_item') line = ind + '- ' + rich(v.rich_text);
      else if (t === 'numbered_list_item') line = ind + '1. ' + rich(v.rich_text);
      else if (t === 'to_do') line = ind + '- [' + (v.checked ? 'x' : ' ') + '] ' + rich(v.rich_text);
      else if (t === 'quote') line = '> ' + rich(v.rich_text);
      else if (t === 'callout') line = '> ' + (v.icon && v.icon.emoji ? v.icon.emoji + ' ' : '') + rich(v.rich_text);
      else if (t === 'code') line = '```' + (v.language || '') + '\n' + rich(v.rich_text) + '\n```';
      else if (t === 'divider') line = '---';
      else if (t === 'image') { const src = v.external ? v.external.url : (v.file ? v.file.url : ''); line = '![' + rich(v.caption) + '](' + src + ')'; }
      else if (t === 'bookmark') line = '<' + v.url + '>';
      else if (t === 'table') { line = ''; }
      else if (t === 'table_row') line = '| ' + (v.cells || []).map(c => rich(c)).join(' | ') + ' |';
      else if (t === 'toggle') line = ind + '- ' + rich(v.rich_text);
      else if (t === 'child_page') line = '📄 ' + (v.title || '');
      if (line !== '' || t === 'paragraph') out.push(line);
      if (b.has_children && t !== 'child_page') out.push(await blocksToMd(b.id, (depth || 0) + (/(list_item|to_do|toggle)$/.test(t) ? 1 : 0)));
    }
    cursor = r.has_more ? r.next_cursor : null;
  } while (cursor);
  return out.join('\n');
}
const slug = (s, id) => (String(s || '').trim().replace(/[\\/:*?"<>|#%]/g, '').replace(/\s+/g, '-').slice(0, 60) || 'page') + '-' + id.replace(/-/g, '').slice(0, 8);
const yaml = s => JSON.stringify(String(s == null ? '' : s));

(async () => {
  fs.mkdirSync(DOCS, { recursive: true });
  const pages = []; let cursor;
  do {
    const r = await api('databases/' + DB + '/query', Object.assign({ page_size: 100, filter: { property: STATUS_PROP, [ 'status' ]: { equals: STATUS_VALUE } } }, cursor ? { start_cursor: cursor } : {}))
      .catch(async e => { if (/status/.test(e.message)) return api('databases/' + DB + '/query', Object.assign({ page_size: 100, filter: { property: STATUS_PROP, select: { equals: STATUS_VALUE } } }, cursor ? { start_cursor: cursor } : {})); throw e; });
    pages.push(...r.results); cursor = r.has_more ? r.next_cursor : null;
  } while (cursor);
  const keep = new Set(); let written = 0, unchanged = 0;
  for (const p of pages) {
    const props = p.properties || {};
    const titleKey = Object.keys(props).find(k => props[k].type === 'title');
    const title = propText(props[titleKey]) || '(제목 없음)';
    const tags = Object.keys(props).filter(k => props[k].type === 'multi_select').map(k => propText(props[k])).filter(Boolean).join(', ');
    const body = await blocksToMd(p.id, 0);
    const file = path.join(DOCS, slug(title, p.id) + '.md'); keep.add(path.basename(file));
    const md = ['---', 'title: ' + yaml(title), 'notion_id: ' + yaml(p.id), 'status: ' + yaml(STATUS_VALUE), 'updated: ' + yaml(p.last_edited_time), 'created: ' + yaml(p.created_time), 'tags: ' + yaml(tags), 'source: notion', '---', '', '# ' + title, '', body, ''].join('\n');
    if (fs.existsSync(file) && fs.readFileSync(file, 'utf8') === md) { unchanged++; continue; }
    fs.writeFileSync(file, md, 'utf8'); written++;
  }
  // 노션에서 Published 가 풀린 문서는 docs 에서 치우되 지우지 않고 _archive 로(자동 영구삭제 금지 원칙)
  let archived = 0;
  for (const f of fs.readdirSync(DOCS)) {
    if (!f.endsWith('.md') || f === 'README.md' || keep.has(f)) continue;
    const s = fs.readFileSync(path.join(DOCS, f), 'utf8');
    if (!/^source: notion$/m.test(s)) continue;
    fs.mkdirSync(path.join(DOCS, '_archive'), { recursive: true });
    fs.renameSync(path.join(DOCS, f), path.join(DOCS, '_archive', f)); archived++;
  }
  const idx = ['# 문서 목록 (노션 → 깃허브 자동 동기화)', '', '갱신: ' + new Date().toISOString(), ''].concat(Array.from(keep).sort().map(f => '- [' + f.replace(/\.md$/, '') + '](' + f + ')')).join('\n') + '\n';
  fs.writeFileSync(path.join(DOCS, 'README.md'), idx, 'utf8');
  console.log(`노션 Published ${pages.length}쪽 → 새로 씀 ${written} · 그대로 ${unchanged} · 보관 ${archived}`);
})().catch(e => { console.error('동기화 실패:', e.message); process.exit(1); });
