import sharp from 'sharp';
const cover = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
<rect width="1200" height="630" fill="#0b0c0a"/>
<rect x="24" y="24" width="1152" height="582" fill="none" stroke="#4b4029"/>
<rect x="24" y="24" width="1152" height="5" fill="#d2b06b"/>
<path d="M915 120L1110 315 915 510 720 315Z" fill="none" stroke="#d2b06b" stroke-opacity=".18"/>
<path d="M915 180L1050 315 915 450 780 315Z" fill="none" stroke="#d2b06b" stroke-opacity=".3"/>
<g font-family="Arial,sans-serif"><text x="76" y="108" fill="#d2b06b" font-size="36" font-weight="700">LCC NTB</text>
<text x="78" y="139" fill="#d2b06b" font-size="13" letter-spacing="5">AWARDS 2026</text>
<text x="76" y="272" fill="#f6f5ef" font-size="62" letter-spacing="-2">Merayakan karya.</text>
<text x="76" y="348" fill="#d2b06b" font-size="62" letter-spacing="-2">Mengangkat cerita.</text>
<text x="78" y="405" fill="#c0beb2" font-size="23">Lombok Content Creators Awards</text>
<text x="915" y="330" text-anchor="middle" fill="#d2b06b" font-size="54" font-weight="700">2026</text>
<line x1="76" y1="494" x2="1124" y2="494" stroke="#4b4029"/>
<text x="78" y="549" fill="#d2b06b" font-size="20">lcc-ntb.com</text>
<text x="1124" y="549" text-anchor="end" fill="#c0beb2" font-size="17">LOMBOK · NUSA TENGGARA BARAT</text></g></svg>`;
await sharp(Buffer.from(cover)).jpeg({quality:92, mozjpeg:true}).toFile('public/og-cover.jpg');
