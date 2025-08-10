import path from 'path';

// Test paths similar to the bug reproduction test
const testDir = '/home/founder3/code/github/fwdslsh/unify/test/test-temp/bug-reproduction';
const sourceDir = path.join(testDir, 'src');
const componentsDir = path.join(sourceDir, 'custom_components');
const layoutsDir = path.join(sourceDir, 'site_layouts');

const config = {
  components: componentsDir,
  layouts: layoutsDir
};

console.log('Testing path.basename() logic:');
console.log('config.components:', config.components);
console.log('path.basename(config.components):', path.basename(config.components));
console.log('config.layouts:', config.layouts);
console.log('path.basename(config.layouts):', path.basename(config.layouts));

// Test the filtering logic
const testFile1 = path.join(componentsDir, 'alert.html');
const testFile2 = path.join(layoutsDir, 'blog.html');

const relativePath1 = path.relative(sourceDir, testFile1);
const pathParts1 = relativePath1.split(path.sep);
console.log('\nTesting component file:');
console.log('testFile1:', testFile1);
console.log('relativePath1:', relativePath1);
console.log('pathParts1:', pathParts1);
console.log('pathParts1.includes(path.basename(config.components)):', pathParts1.includes(path.basename(config.components)));

const relativePath2 = path.relative(sourceDir, testFile2);
const pathParts2 = relativePath2.split(path.sep);
console.log('\nTesting layout file:');
console.log('testFile2:', testFile2);
console.log('relativePath2:', relativePath2);
console.log('pathParts2:', pathParts2);
console.log('pathParts2.includes(path.basename(config.layouts)):', pathParts2.includes(path.basename(config.layouts)));
