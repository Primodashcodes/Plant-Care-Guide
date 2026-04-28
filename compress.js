const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const dir = './Public/PlantImage';
const files = fs.readdirSync(dir).filter(f => /\.(jpg|jpeg|png|webp)$/i.test(f));

console.log('Found', files.length, 'images...');

async function compressAll() {
  for (const file of files) {
    const input = path.join(dir, file);
    const output = path.join(dir, file.replace(/\.[^.]+$/, '.jpg'));
    try {
      await sharp(input, { failOn: 'none' })
        .resize(800, 800, { fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 75 })
        .toFile(output + '.tmp.jpg');
      fs.renameSync(output + '.tmp.jpg', output);
      console.log('✅ Compressed:', file);
    } catch (e) {
      console.log('❌ Skip:', file, e.message);
    }
  }
  console.log('🎉 Done!');
}

compressAll();