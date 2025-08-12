# 🐳 Unify CLI Container

This image provides the Unify CLI for building and serving static sites using Bun. Optimized for fast builds, CI/CD, and local development.

## Quick Start

```bash

# Pull the image from the registry
docker pull fwdslsh/unify-cli:latest

# Run unify commands directly
docker run --rm -v $(pwd)/my-site:/workspace fwdslsh/unify-cli:latest build

# Interactive shell with unify available
docker run --rm -it -v $(pwd)/my-site:/workspace fwdslsh/unify-cli:latest sh
```

## Features

- Bun-native static site generator
- Supports all Unify CLI commands
- Fast incremental builds
- Single file executable, fast startup
- Non-root user, minimal attack surface
- Full compatibility with Bun executables

## Volume Mounts

- `/workspace` - Your working directory

## Example

```bash
docker run --rm -v $(pwd):/workspace fwdslsh/unify-cli:latest build --source src --output dist
```

## Architecture Benefits

### 🚀 Performance

- Fast startup: No Node.js bootstrap or dependency loading
- Small size: 90% reduction in image size vs traditional Node.js images
- Cross-platform: Single executable works on amd64 and arm64

### 🔒 Security

- Minimal attack surface: Only essential packages included
- Non-root users: All services run as unprivileged users
- Vulnerability scanning: Automated Trivy security scans in CI/CD
- Distroless approach: Minimal base images with security updates

### 🎯 Deployment

- No runtime dependencies: Self-contained executable
- Simple scaling: Stateless containers perfect for Kubernetes
- CI/CD optimized: Fast builds and deploys

## Docker Compose Usage

The project includes a `docker-compose.yml` with multiple service profiles:

**Note**: Profiles require Docker Compose v2.0+ (use `docker compose` instead of `docker-compose`)

### CLI Building

```bash
docker compose --profile cli run --rm unify-cli
docker-compose run --rm unify-cli
```

## Registry Information

Images are published to:

- `fwdslsh/unify-cli:latest`

## Version Tags

- `latest` - Latest stable release
- `v1.2.3` - Specific version tags
- `1.2` - Major.minor tags
- `1` - Major version tags

## Build Information

Images are built automatically via GitHub Actions on:

- Push to main branch → `latest` tag
- Release tags → version tags
- Pull requests → test builds (not published)

Each build includes:

- ✅ Single file executable compilation with Bun
- ✅ Multi-platform builds (amd64, arm64)
- ✅ Security vulnerability scanning
- ✅ Automated testing
- ✅ Size optimization

## Troubleshooting

**Permission denied when mounting volumes:**

```bash
chmod -R 755 ./my-site
docker run --user $(id -u):$(id -g) --rm -v $(pwd):/workspace unify-cli
```

**Port already in use:**

```bash
lsof -i :3000
docker run -p 3001:3000 unify-cli
```

**File watching not working:**

```bash
docker run --rm -v $(pwd)/my-site:/workspace:rw unify-cli
```

**Docker Compose profiles not working:**

```bash
docker compose --profile cli run --rm unify-cli
docker-compose run --rm unify-cli
docker compose version  # Should be v2.0+
```

**Getting Help**

- Check container logs: `docker logs <container-id>`
- Interactive debugging: `docker run --rm -it unify-cli sh`

## Maintainer

fwdslsh/unify
