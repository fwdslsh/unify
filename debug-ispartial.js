import { isPartialFile } from './src/utils/path-resolver.js';
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

const testFiles = [
  path.join(componentsDir, 'alert.html'),
  path.join(layoutsDir, 'blog.html'),
  path.join(sourceDir, 'blog.html')
];

console.log('Testing isPartialFile function:');
console.log('componentsDir:', componentsDir);
console.log('layoutsDir:', layoutsDir);
console.log('config:', config);

testFiles.forEach(filePath => {
  const result = isPartialFile(filePath, config);
  console.log(`${filePath} -> isPartial: ${result}`);
});
