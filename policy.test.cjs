const { test } = require('node:test');
const assert = require('node:assert/strict');
const { inspect, canChange } = require('./src/policy.cjs');
const doc = '---\nlanguage: csharp\nkind: Statements\n---\n# Title\n\n```csharp run\nConsole.WriteLine(1);\n```\n\nMore documentation.\n';
function edit(text, from, to, insert) { return canChange(text, text.slice(0,from)+insert+text.slice(to), [{from,to,insertLength:insert.length}]); }
test('title and surrounding Markdown remain editable', () => {
 const a=doc.indexOf('Title'), b=doc.indexOf('More');
 assert.ok(edit(doc,a,a+5,'New name'));
 assert.ok(edit(doc,b,doc.length,'# Additional documentation\nText\n'));
});
test('code edits and deletion allowed', () => {
 const p=inspect(doc);
 assert.ok(edit(doc,p.codeStart,p.codeEnd,'var value = 2;\n'));
 assert.ok(edit(doc,p.codeStart,p.codeEnd,''));
 assert.ok(edit(doc,p.codeEnd,p.codeEnd,'MoreCode();\n'));
});
test('YAML and frontmatter delimiters protected', () => {
 assert.equal(edit(doc,doc.indexOf('Statements'),doc.indexOf('Statements')+10,'Program'), false);
 assert.equal(edit(doc,0,0,'x'),false);
 assert.equal(edit(doc,0,4,''),false);
});
test('run delimiters and language protected', () => {
 const p=inspect(doc);
 assert.equal(edit(doc,p.locks[1].from,p.codeStart,''),false);
 assert.equal(edit(doc,p.codeEnd,p.locks[2].to,''),false);
 assert.equal(edit(doc,p.locks[1].from+3,p.locks[1].from+9,'vb'),false);
});
test('cross-boundary deletion and whole-document replacement blocked', () => {
 assert.equal(edit(doc,0,doc.length,'replacement'),false);
 const p=inspect(doc);
 assert.equal(edit(doc,p.codeEnd-2,p.codeEnd+3,''),false);
});
test('new run block or earlier closing fence rejected', () => {
 assert.equal(edit(doc,doc.length,doc.length,'```csharp run\nx\n```\n'),false);
 const p=inspect(doc);
 // Moving the existing closer into code must not be mistaken for a safe boundary edit.
 assert.equal(edit(doc,p.codeStart,p.codeStart,'```\n'),false);
});
test('CRLF and VB supported; literal YAML unchanged', () => {
 const vb=doc.replace('csharp','vb').replace('```csharp run','```vb run').replaceAll('\n','\r\n');
 const a=vb.indexOf('Title');
 assert.ok(edit(vb,a,a+5,'New title'));
 assert.equal(inspect(vb).signature[0],vb.slice(0,vb.indexOf('# Title')));
});
test('invalid/unclosed input is read-only', () => {
 for(const text of ['hello', '---\nlanguage: csharp\n', doc.replace(/```\n\nMore/, '\n\nMore')])
  assert.equal(edit(text,text.length,text.length,'x'),false);
});
test('edits in multiple regions require all changes to be allowed', () => {
 const next=doc.replace('Title','Names').replace('Statements','Program');
 assert.equal(canChange(doc,next,[{from:doc.indexOf('Title'),to:doc.indexOf('Title')+5},{from:doc.indexOf('Statements'),to:doc.indexOf('Statements')+10}]),false);
});

test('hidden fence ranges exclude line breaks and code in LF and CRLF', () => {
 const { fenceTextRanges } = require('./src/policy.cjs');
 for (const text of [doc, doc.replaceAll('\n','\r\n')]) {
  const ranges=fenceTextRanges(text);
  assert.equal(ranges.length,2);
  assert.equal(text.slice(ranges[0].from,ranges[0].to),'```csharp run');
  assert.equal(text.slice(ranges[1].from,ranges[1].to),'```');
  for(const range of ranges) assert.doesNotMatch(text.slice(range.from,range.to),/[\r\n]/);
  assert.ok(ranges[0].to < text.indexOf('Console.WriteLine'));
 }
 assert.deepEqual(fenceTextRanges('invalid'),[]);
});

test('title contents can be cleared but heading structure remains', () => {
 const title=require('./src/policy.cjs').sections(doc).title;
 assert.ok(edit(doc,title.contentFrom,title.contentTo,''));
 assert.equal(edit(doc,title.from,title.to,''),false);
 assert.equal(edit(doc,title.from,title.from+2,''),false);
 assert.equal(edit(doc,title.contentTo,title.to,''),false);
});
test('description contents can be cleared but reserved line remains', () => {
 const text=doc.replace('# Title\n\n', '# Title\nDescription\n');
 const intro=require('./src/policy.cjs').sections(text).intro;
 assert.ok(edit(text,intro.from,intro.to-1,''));
 assert.equal(edit(text,intro.from,intro.to,''),false);
});
test('additional documentation can be fully cleared', () => {
 const part=require('./src/policy.cjs').sections(doc).outro;
 assert.ok(edit(doc,part.from,part.to,''));
});
test('missing title and description can be added without changing YAML or fences', () => {
 const text=doc.replace('# Title\n\n','');
 const at=inspect(text).locks[0].to;
 assert.ok(edit(text,at,at,'# \n\n'));
 const noFinalNewline=doc.slice(0,inspect(doc).locks[2].to).trimEnd();
 assert.ok(edit(noFinalNewline,noFinalNewline.length,noFinalNewline.length,'\n'));
});

test('additional fenced and indented code blocks rejected outside run', () => {
 for (const block of ['```js\nx()\n```\n','~~~python\nx()\n~~~\n','    code();\n','> ```js\n> x()\n> ```\n','- item\n\n  ```js\n  x()\n  ```\n'])
  assert.equal(edit(doc,doc.length,doc.length,'\n'+block),false,block);
});
test('ordinary Markdown, inline code and nested lists allowed', () => {
 for (const markdown of ['Inline `value` and **bold**.\n','- first\n    - nested\n','> A quotation\n','## Heading\n\n[link](https://example.com)\n'])
  assert.ok(edit(doc,doc.length,doc.length,'\n'+markdown),markdown);
});
test('existing documentation code is not deleted or globally locked', () => {
 const text=doc+'\n```js\nlegacy()\n```\n';
 const title=text.indexOf('Title');
 assert.ok(edit(text,title,title+5,'Other'));
 assert.equal(edit(text,text.length,text.length,'\n```js\nlegacy()\n```\n'),false);
});
test('code inside the executable block stays editable', () => {
 const part=inspect(doc);
 assert.ok(edit(doc,part.codeStart,part.codeEnd,'    var name = "value";\n'));
});

test('code-only fast path does not skip checks for mixed edits', () => {
 const p=inspect(doc), end=doc.length, block='\n```js\nx()\n```\n';
 const next=doc.slice(0,p.codeStart)+'y();\n'+doc.slice(p.codeStart)+block;
 assert.equal(canChange(doc,next,[{from:p.codeStart,to:p.codeStart,insertLength:5},{from:end,to:end,insertLength:block.length}]),false);
 const ok=doc.slice(0,p.codeStart)+'y();\n'+doc.slice(p.codeStart)+'\nText\n';
 assert.ok(canChange(doc,ok,[{from:p.codeStart,to:p.codeStart,insertLength:5},{from:end,to:end,insertLength:6}]));
});
test('precomputed inspect result gives the same sections and ranges', () => {
 const { sections, fenceTextRanges, documentationCodeBlocks } = require('./src/policy.cjs');
 const parsed=inspect(doc);
 assert.deepEqual(sections(doc,parsed),sections(doc));
 assert.deepEqual(fenceTextRanges(doc,parsed),fenceTextRanges(doc));
 assert.deepEqual(documentationCodeBlocks(doc,parsed),documentationCodeBlocks(doc));
});
