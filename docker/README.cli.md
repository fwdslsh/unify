# Unify CLI Container

This image provides the Unify CLI for building and serving static sites using Bun. It is optimized for fast builds and local development.

## Usage

```bash
# Build the image
docker build -f Dockerfile.cli -t unify-cli .

# Run the CLI
docker run --rm -v $(pwd)/src:/app/src unify-cli build --source /app/src --output /app/dist
```

## Features
- Bun-native static site generator
- Supports all Unify CLI commands
- Fast incremental builds

## Example
```bash
docker run --rm -v $(pwd)/src:/app/src -v $(pwd)/dist:/app/dist unify-cli build --source /app/src --output /app/dist
```

## Maintainer
fwdslsh/unify
