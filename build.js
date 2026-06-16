const fs = require('fs');
const path = require('path');

const srcDir = __dirname;
const destDir = path.join(__dirname, 'www');

// 1. Clean destination directory
if (fs.existsSync(destDir)) {
    fs.rmSync(destDir, { recursive: true, force: true });
}
fs.mkdirSync(destDir);

// 2. Files to copy
const filesToCopy = ['index.html', 'manifest.json', 'sw.js'];
filesToCopy.forEach(file => {
    const srcPath = path.join(srcDir, file);
    const destPath = path.join(destDir, file);
    if (fs.existsSync(srcPath)) {
        fs.copyFileSync(srcPath, destPath);
        console.log(`Copied ${file} to www/`);
    }
});

// 3. Directories to copy
const dirsToCopy = ['css', 'js', 'images', 'front cover', 'back cover', 'inside pages'];
dirsToCopy.forEach(dir => {
    const srcPath = path.join(srcDir, dir);
    const destPath = path.join(destDir, dir);
    if (fs.existsSync(srcPath)) {
        fs.cpSync(srcPath, destPath, { recursive: true });
        console.log(`Copied directory ${dir} to www/`);
    }
});

console.log('Build complete! Web assets exported to www/');
