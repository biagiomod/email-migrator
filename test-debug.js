const path = require('path');
const fs = require('fs');
const { HtmlExtractorAdapter } = require('./dist/src/extractors/html-extractor.js');

const fixturePath = path.resolve(__dirname, './fixtures/sample-welcome.html');
const fixtureHtml = fs.readFileSync(fixturePath, 'utf-8');
const extractor = new HtmlExtractorAdapter();

const raw = extractor.extract(fixtureHtml, fixturePath, 'sample-welcome');
console.log('Content blocks:');
raw.contentBlocks.forEach((cb, idx) => {
  console.log(`[${idx}] type=${cb.type}, url=${JSON.stringify(cb.url)}`);
});
