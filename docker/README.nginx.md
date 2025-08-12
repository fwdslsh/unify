# 🐳 Unify Nginx Container

This image provides an Nginx server configured for Unify static sites. Optimized for high-performance static file serving, caching, and live reload.

## Quick Start

```bash

# Pull the image from the registry
docker pull fwdslsh/unify-nginx:latest

# Run the container
docker run --rm -p 8080:80 \
	-v $(pwd)/my-site:/site \
	fwdslsh/unify-nginx:latest
```

## Features

- Nginx optimized for static HTML/CSS/JS
- Custom configuration via `nginx.conf` (override by mounting)
- Supports gzip and caching headers
- Live reload, file watching, health checks
- Non-root user, minimal attack surface
- Full compatibility with Bun executables

## Volume Mounts

- `/site` - Your source files (required)
- `/var/www/html` - Generated output (managed automatically)

## Ports

- `80` - Production NGINX server
- `3000` - Development server with live reload

## Example

```bash
docker run -v $(pwd)/site:/site:ro -d -p 8080:80 fwdslsh/unify-nginx:latest
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

### Production Server

```bash
docker compose --profile prod up unify-nginx
docker-compose up unify-nginx
```

### Development Server

```bash
docker compose --profile dev up unify-dev
docker-compose up unify-dev
```

## Registry Information

Images are published to:

- `fwdslsh/unify-nginx:latest`

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
docker run --user $(id -u):$(id -g) --rm -v $(pwd):/site unify-nginx
```

**Port already in use:**

```bash
lsof -i :3000
docker run -p 3001:3000 unify-nginx
```

**File watching not working:**

```bash
docker run --rm -v $(pwd)/my-site:/site:rw unify-nginx
```

**Docker Compose profiles not working:**

```bash
docker compose --profile prod up unify-nginx
docker-compose up unify-nginx
docker compose version  # Should be v2.0+
```

**Getting Help**

- Check container logs: `docker logs <container-id>`
- Interactive debugging: `docker run --rm -it unify-nginx sh`

## Maintainer

fwdslsh/unify
