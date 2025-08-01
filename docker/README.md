# 🐳 **Docker Usage**

Streamlined Docker images using single file executables for fast startup and minimal size.

## Quick Start

### CLI Only (Ubuntu Linux - ~70MB)

```bash
# Run unify commands directly
docker run --rm -v $(pwd)/my-site:/workspace ghcr.io/dompile/unify-cli:latest build

# Interactive shell with unify available
docker run --rm -it -v $(pwd)/my-site:/workspace ghcr.io/dompile/unify-cli:latest sh
```

### Production deployment with NGINX

```bash
docker run --rm -p 8080:80 \
  -v $(pwd)/my-site:/site \
  ghcr.io/dompile/unify-nginx:latest
```

### Development with live reload

```bash
docker run --rm -p 3000:3000 \
  -v $(pwd)/my-site:/site \
  ghcr.io/dompile/unify-nginx:latest \
  unify serve --source /site --output /var/www/html --port 3000 --host 0.0.0.0
```

## Image Variants

### `unify-cli` (Ubuntu + single executable)

- **Size**: ~70MB
- **Base**: Ubuntu 22.04
- **Use case**: CI/CD, command-line usage
- **Security**: Non-root user, minimal attack surface
- **Dependencies**: Only ca-certificates and tzdata
- **glibc**: Full compatibility with Bun executables

### `unify-nginx` (NGINX + single executable)

- **Size**: ~150MB
- **Base**: NGINX Debian Bookworm
- **Use case**: Production web serving with auto-rebuild
- **Features**: Live reload, file watching, health checks
- **Dependencies**: curl (health checks), ca-certificates
- **glibc**: Full compatibility with Bun executables

### `unify-apache` (Apache + single executable)

- **Size**: ~200MB
- **Base**: Ubuntu 22.04 with Apache
- **Use case**: Enterprise production serving
- **Features**: Security modules, SSI support
- **Security**: Non-root user, security headers
- **glibc**: Full compatibility with Bun executables

## Architecture Benefits

### 🚀 **Performance**

- **Fast startup**: No Node.js bootstrap or dependency loading
- **Small size**: 90% reduction in image size vs traditional Node.js images
- **Cross-platform**: Single executable works on amd64 and arm64

### 🔒 **Security**

- **Minimal attack surface**: Only essential packages included
- **Non-root users**: All services run as unprivileged users
- **Vulnerability scanning**: Automated Trivy security scans in CI/CD
- **Distroless approach**: Minimal base images with security updates

### 🎯 **Deployment**

- **No runtime dependencies**: Self-contained executable
- **Simple scaling**: Stateless containers perfect for Kubernetes
- **CI/CD optimized**: Fast builds and deploys

## Volume Mounts

- **CLI image**: `/workspace` - Your working directory
- **NGINX image**: `/site` - Your source files (required)
- **NGINX image**: `/var/www/html` - Generated output (managed automatically)
- **Apache image**: `/var/www/html` - Static files (read-only mount recommended)

## Ports

- `80` - Production NGINX server
- `8080` - Apache server
- `3000` - Development server with live reload

## Docker Compose Usage

The project includes a `docker-compose.yml` with multiple service profiles:

**Note**: Profiles require Docker Compose v2.0+ (use `docker compose` instead of `docker-compose`)

### CLI Building

```bash
# Build your site using CLI service
docker compose --profile cli run --rm unify-cli

# Alternative for older docker-compose versions
docker-compose run --rm unify-cli
```

### Development Server

```bash
# Start development server with live reload
docker compose --profile dev up unify-dev

# Alternative for older docker-compose versions
docker-compose up unify-dev
```

### Production Servers

```bash
# NGINX production server
docker compose --profile prod up unify-nginx

# Apache production server  
docker compose --profile apache up unify-apache

# Alternative for older docker-compose versions
docker-compose up unify-nginx
docker-compose up unify-apache
```

## Examples

### Build and serve a static site

```bash
# Build once
docker run --rm -v $(pwd):/workspace ghcr.io/dompile/unify-cli:latest \
  build --source src --output dist

# Serve with live reload
docker run --rm -p 3000:3000 -v $(pwd):/site ghcr.io/dompile/unify-nginx:latest
```

### CI/CD Pipeline

```bash
# In your CI script
docker run --rm -v $(pwd):/workspace ghcr.io/dompile/unify-cli:latest \
  build --source src --output public --minify --clean
```

### Kubernetes Deployment

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: unify-site
spec:
  replicas: 3
  selector:
    matchLabels:
      app: unify-site
  template:
    metadata:
      labels:
        app: unify-site
    spec:
      containers:
        - name: unify-nginx
          image: ghcr.io/dompile/unify-nginx:latest
          ports:
            - containerPort: 80
          volumeMounts:
            - name: site-content
              mountPath: /site
              readOnly: true
      volumes:
        - name: site-content
          configMap:
            name: my-site-config
```

### Development Workflow

```bash
# 1. Start development environment
docker compose --profile dev up -d

# 2. Your site is now available at http://localhost:3000
# 3. Edit files in ./example/src/ - changes auto-reload

# 4. Build for production
docker compose --profile cli run --rm unify-cli build --source src --output dist --minify

# 5. Test production build
docker compose --profile prod up
```

## Registry Information

Images are published to both registries:

### GitHub Container Registry (Recommended)

- `ghcr.io/dompile/unify-cli:latest`
- `ghcr.io/dompile/unify-nginx:latest`
- `ghcr.io/dompile/unify-apache:latest`

### Docker Hub

- `itlackey/unify-cli:latest`
- `itlackey/unify-nginx:latest`
- `itlackey/unify-apache:latest`

### Version Tags

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

### Common Issues

**Permission denied when mounting volumes:**

```bash
# Ensure your source directory is readable
chmod -R 755 ./my-site

# Or run with user ID mapping
docker run --user $(id -u):$(id -g) --rm -v $(pwd):/workspace ghcr.io/dompile/unify-cli:latest
```

**Port already in use:**

```bash
# Check what's using the port
lsof -i :3000

# Use different port
docker run -p 3001:3000 ghcr.io/dompile/unify-nginx:latest
```

**File watching not working:**

```bash
# Ensure files are properly mounted and writable
docker run --rm -v $(pwd)/my-site:/site:rw ghcr.io/dompile/unify-nginx:latest
```

**Docker Compose profiles not working:**

```bash
# Use modern docker compose (without hyphen) for profile support
docker compose --profile prod up

# If you get "no service was selected" error, try:
docker-compose up unify-nginx  # Direct service name

# Check Docker Compose version
docker compose version  # Should be v2.0+
```

### Getting Help

- Check container logs: `docker logs <container-id>`
- Run with verbose output: Add `--verbose` flag to unify commands
- Interactive debugging: `docker run --rm -it ghcr.io/dompile/unify-cli:latest sh`
