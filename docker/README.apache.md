# 🐳 Unify Apache Container

This image provides an Apache HTTP server configured for Unify static sites, with SSI includes and optimized caching.

## Quick Start

```bash

# Pull the image from the registry
docker pull fwdslsh/unify-apache:latest

# Run the container
docker run --rm -p 8080:80 \
	-v $(pwd)/my-site:/var/www/html \
	fwdslsh/unify-apache:latest
```

## Features

- Apache SSI support
- Security modules, security headers
- Custom configuration via `apache.conf` (override by mounting)
- Optimized for static HTML/CSS/JS
- Non-root user, minimal attack surface
- Full compatibility with Bun executables

## Volume Mounts

- `/var/www/html` - Static files (read-only mount recommended)

## Ports

- `8080` - Apache server

## Example

```bash
docker run -v $(pwd)/site:/var/www/html:ro -d -p 8080:80 fwdslsh/unify-apache:latest
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
docker compose --profile apache up unify-apache
# Or for older docker-compose:
docker-compose up unify-apache
```

## Registry Information

Images are published to:

- `fwdslsh/unify-apache:latest`

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
docker run --user $(id -u):$(id -g) --rm -v $(pwd):/var/www/html unify-apache
```

**Port already in use:**

```bash
lsof -i :8080
docker run -p 8081:8080 unify-apache
```

**Docker Compose profiles not working:**

```bash
docker compose --profile apache up
docker-compose up unify-apache
docker compose version  # Should be v2.0+
```

**Getting Help**

- Check container logs: `docker logs <container-id>`
- Interactive debugging: `docker run --rm -it unify-apache sh`

## Maintainer

fwdslsh/unify
