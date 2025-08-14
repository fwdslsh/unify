# Unify Docker Image

Modern static site generator with server-side includes, DOM templating, and live development features.

## Usage

Run Unify in Docker:

```bash
# Build a static site
docker run --rm -v $(pwd):/workspace:rw -u $(id -u):$(id -g) fwdslsh/unify:latest build --source src --output dist

# Start development server
docker run --rm -p 3000:3000 -v $(pwd):/workspace:rw -u $(id -u):$(id -g) fwdslsh/unify:latest serve --host 0.0.0.0

# Then open http://localhost:3000 in your browser to view the site.
```

### Common Options

- `build`: Build static site from source
- `serve`: Start development server with live reload
- `watch`: Watch mode for development
- `--source, -s <path>`: Source directory (default: `src`)
- `--output, -o <path>`: Output directory (default: `dist`)
- `--port, -p <number>`: Server port (default: `3000`)
- `--pretty-urls`: Generate pretty URLs (page.html → page/index.html)
- `--minify`: Minify HTML output
- `--help, -h`: Show usage information
- `--version, -v`: Show current version

## Example

```bash
# Build with pretty URLs and minification
docker run --rm -v $(pwd):/workspace -u $(id -u):$(id -g) fwdslsh/unify:latest build \
  --pretty-urls \
  --minify
```

## Features

- Server-Side Includes (SSI)
- DOM templating with slots
- Markdown processing with frontmatter
- Live reload development server
- Asset optimization
- Automatic sitemap generation

## Documentation

For full documentation and advanced usage, see:

- [GitHub Project](https://github.com/fwdslsh/unify)
