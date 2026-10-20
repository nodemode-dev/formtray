import { chromium } from 'playwright'; import fs from 'fs';
const [,, svgPath, outPath, w, h] = process.argv;
const svg = fs.readFileSync(svgPath,'utf8').replace(/<\?xml[^>]*>/,'').replace('<svg ', `<svg width="${w}" height="${h}" preserveAspectRatio="xMidYMid meet" `);
const b = await chromium.launch(); const p = await b.newPage({viewport:{width:+w,height:+h}});
await p.setContent(`<html><body style="margin:0;background:transparent">${svg}</body></html>`);
await p.screenshot({path:outPath, omitBackground:true}); await b.close();
