#!/usr/bin/env bun

// Test style injection logic specifically
function testStyleInjection() {
  console.log('🧪 Testing style injection logic...');
  
  const existingHTML = `<!DOCTYPE html>
<html>
<head>
  <title>Test</title>
  <style>
    .existing { color: blue; }
  </style>
</head>
<body>
  <div>Content</div>
</body>
</html>`;

  const newStyles = ['<style>\n.alert { color: red; }\n</style>', '<style>\n.card { border: 1px solid #ddd; }\n</style>'];

  console.log('📄 Original HTML:');
  console.log(existingHTML);
  
  console.log('\n🎨 Styles to inject:');
  console.log(newStyles);

  // Test the injection logic
  const headEndRegex = /<\/head>/i;
  const dedupedStyles = [...new Set(newStyles)]; // Remove duplicates
  const stylesHTML = dedupedStyles.join('\n');
  const result = existingHTML.replace(headEndRegex, `${stylesHTML}\n</head>`);
  
  console.log('\n✅ Result:');
  console.log(result);
  
  console.log('\n🔍 Analysis:');
  console.log('Contains .alert styles:', result.includes('.alert'));
  console.log('Contains .card styles:', result.includes('.card'));
  console.log('Styles injected before </head>:', result.includes('</style>\n</head>'));
}

testStyleInjection();
