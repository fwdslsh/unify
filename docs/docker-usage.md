# Docker Usage Guide

unify provides three different Docker container options for different use cases. This guide explains when to use each container type and how to deploy them.

## Container Types Overview

| Container | Best For | Web Server | Use Case |
|-----------|----------|------------|----------|
| **Apache** | Production static hosting | Apache HTTP Server | High-performance static site serving |
| **Nginx** | Production with build automation | Nginx | Auto-build and serve with better performance |
| **CLI** | Development and CI/CD | None | Building sites in pipelines, development |

## Apache Container (`Dockerfile.apache`)

### When to Use Apache Container

- **Production hosting** of static sites
- **High traffic** websites requiring proven performance
- **Enterprise environments** where Apache is preferred
- **Security-focused deployments** with minimal attack surface
- **Pure static serving** without build requirements

### Benefits of Apache Container

- **Lightweight**: Only Apache and static files, no Node.js runtime
- **Secure**: Runs as non-root user, minimal packages installed
- **Fast**: Optimized for static file serving
- **Reliable**: Apache's proven stability and performance
- **Configurable**: Easy to customize Apache configuration

### Apache Container Usage

#### Basic Static Hosting

```bash
# Build your site first (locally or in CI)
unify build --source src --output dist

# Serve with Apache container
docker run -d \
  --name my-site \
  -p 8080:8080 \
  -v $(pwd)/dist:/var/www/html:ro \
  unify:apache
```

#### Production Deployment

```bash
# Production setup with restart policy
docker run -d \
  --name production-site \
  --restart unless-stopped \
  -p 80:8080 \
  -v /path/to/built/site:/var/www/html:ro \
  unify:apache
```

#### Custom Apache Configuration

```bash
# Mount custom Apache config
docker run -d \
  --name custom-apache \
  -p 8080:8080 \
  -v $(pwd)/dist:/var/www/html:ro \
  -v $(pwd)/custom-apache.conf:/etc/apache2/sites-available/000-default.conf:ro \
  unify:apache
```

### Apache Container Features

- **Port**: Serves on port 8080 internally
- **Document Root**: `/var/www/html`
- **User**: Runs as `htmluser` (non-root)
- **Security**: Minimal packages, disabled unused modules
- **Performance**: Optimized for static content delivery

## Nginx Container (`Dockerfile.nginx`)

### When to Use Nginx Container

- **Production with automatic building** from source files
- **Continuous deployment** scenarios
- **High-performance serving** with modern features
- **Sites that need rebuilding** when source changes
- **Development-to-production** consistency

### Benefits of Nginx Container

- **Auto-building**: Automatically builds site from source
- **High performance**: Nginx optimized for concurrent connections
- **Modern features**: HTTP/2, compression, advanced caching
- **Development friendly**: Can rebuild on file changes
- **All-in-one**: Build tool + web server in single container

### Nginx Container Usage

#### Auto-Build and Serve

```bash
# Automatically build from source and serve
docker run -d \
  --name auto-build-site \
  -p 80:80 \
  -v $(pwd)/src:/site:ro \
  unify:nginx
```

#### Production with Health Checks

```bash
# Production deployment with health monitoring
docker run -d \
  --name nginx-site \
  --restart unless-stopped \
  --health-cmd="curl -f http://localhost/ || exit 1" \
  --health-interval=30s \
  -p 80:80 \
  -v $(pwd)/src:/site:ro \
  unify:nginx
```

#### Development with Live Rebuild

```bash
# Development mode with file watching
docker run -d \
  --name dev-nginx \
  -p 3000:80 \
  -v $(pwd)/src:/site \
  -e NODE_ENV=development \
  unify:nginx
```

### Nginx Container Features

- **Port**: Serves on port 80
- **Source Mount**: `/site` (your source files)
- **Output**: `/var/www/html` (automatically generated)
- **Health Check**: Built-in HTTP health monitoring
- **Auto-Build**: Runs unify build automatically
- **Environment**: Supports `NODE_ENV` for development mode

## CLI Container (`Dockerfile.cli`)

### When to Use CLI Container

- **CI/CD pipelines** for building static sites
- **Development environments** without local Node.js
- **Build automation** in containerized workflows
- **Testing** unify in isolated environments
- **Cross-platform development** with consistent tooling

### Benefits of CLI Container

- **Minimal**: Just Node.js and unify CLI
- **Flexible**: Run any unify command
- **Consistent**: Same environment across all platforms
- **CI-friendly**: Perfect for automated builds
- **Development**: No local Node.js installation required

### CLI Container Usage

#### CI/CD Build Pipeline

```bash
# Build site in CI pipeline
docker run --rm \
  -v $(pwd):/workspace \
  -w /workspace \
  unify:cli \
  build --source src --output dist --pretty-urls
```

#### Development Environment

```bash
# Development server without local Node.js
docker run --rm \
  -p 3000:3000 \
  -v $(pwd):/workspace \
  -w /workspace \
  unify:cli \
  serve --source src --host 0.0.0.0
```

#### Watch Mode for Development

```bash
# File watching with live rebuild
docker run --rm \
  -v $(pwd):/workspace \
  -w /workspace \
  unify:cli \
  watch --source src --output dist
```

#### Custom Build Commands

```bash
# Advanced build with custom options
docker run --rm \
  -v $(pwd):/workspace \
  -w /workspace \
  unify:cli \
  build \
    --source content \
    --output public \
    --layouts templates \
    --components partials \
    --base-url https://mysite.com \
    --pretty-urls
```

### CLI Container Features

- **Base Image**: Node.js LTS
- **Global Install**: unify available globally
- **Working Directory**: Configurable (use `-w` flag)
- **Volume Mount**: Mount your project directory
- **Command Override**: Run any unify command

## Docker Compose Examples

### Production Stack

```yaml
version: '3.8'
services:
  # Build service (runs once)
  builder:
    image: unify:cli
    volumes:
      - ./src:/workspace
      - site-dist:/workspace/dist
    working_dir: /workspace
    command: build --source . --output dist --pretty-urls
    
  # Serve with Apache
  web:
    image: unify:apache
    ports:
      - "80:8080"
    volumes:
      - site-dist:/var/www/html:ro
    depends_on:
      - builder
    restart: unless-stopped

volumes:
  site-dist:
```

### Development Stack

```yaml
version: '3.8'
services:
  # All-in-one development
  dev:
    image: unify:nginx
    ports:
      - "3000:80"
    volumes:
      - ./src:/site
    environment:
      - NODE_ENV=development
    restart: unless-stopped
```

### Multi-Site Setup

```yaml
version: '3.8'
services:
  # Site 1
  site1:
    image: unify:nginx
    ports:
      - "8080:80"
    volumes:
      - ./site1:/site:ro
    labels:
      - "traefik.http.routers.site1.rule=Host(\`site1.local\`)"
      
  # Site 2  
  site2:
    image: unify:nginx
    ports:
      - "8081:80"
    volumes:
      - ./site2:/site:ro
    labels:
      - "traefik.http.routers.site2.rule=Host(\`site2.local\`)"
```

## Best Practices

### Security

- **Read-only mounts**: Use `:ro` for source files in production
- **Non-root users**: All containers run as non-root
- **Minimal packages**: Only essential software installed
- **Health checks**: Monitor container health in production

### Performance

- **Apache for static**: Use Apache container for pure static hosting
- **Nginx for dynamic**: Use Nginx container when rebuilding is needed
- **Volume optimization**: Use named volumes for better I/O performance
- **Resource limits**: Set memory and CPU limits in production

### Development

- **CLI for building**: Use CLI container in development workflows
- **File watching**: Use appropriate tools for live reload
- **Environment variables**: Configure behavior with env vars
- **Port mapping**: Use different ports for multiple development sites

### Production Deployment

1. **Build once**: Use CLI container to build in CI/CD
2. **Serve optimized**: Use Apache/Nginx containers for serving
3. **Health monitoring**: Implement proper health checks
4. **Logging**: Configure proper log collection
5. **Scaling**: Use load balancers for high traffic

## Troubleshooting

### Common Issues

**Permission errors**: Ensure volume mount permissions are correct
```bash
chmod -R 755 src/
```

**Port conflicts**: Use different port mappings
```bash
docker run -p 8080:80 unify:nginx  # Instead of default 80:80
```

**File watching not working**: Ensure volume is mounted as writable
```bash
-v $(pwd)/src:/site  # Not :ro for development
```

**Build failures**: Check container logs
```bash
docker logs container-name
```

### Debug Commands

```bash
# Check container logs
docker logs -f container-name

# Access container shell
docker exec -it container-name /bin/bash

# Inspect container
docker inspect container-name

# Monitor resource usage
docker stats container-name
```