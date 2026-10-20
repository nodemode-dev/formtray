import { chromium } from 'playwright';
const b = await chromium.launch(); const p = await b.newPage({viewport:{width:1024,height:1024}});
for (let i=2;i<process.argv.length;i+=2){ await p.goto('file://'+process.argv[i]); await p.waitForTimeout(150); await p.screenshot({path:process.argv[i+1], omitBackground:true}); }
await b.close();
