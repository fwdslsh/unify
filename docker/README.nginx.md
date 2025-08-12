# Unify Nginx Container

This image provides an Nginx server configured for use with Unify static sites. It is optimized for high-performance static file serving and caching.

## Usage

```bash
# Build the image
docker build -f Dockerfile.nginx -t unify-nginx .

# Run the container
docker run -d -p 8080:80 unify-nginx
```

## Features
- Nginx optimized for static HTML/CSS/JS
- Custom configuration via `nginx.conf`
- Supports gzip and caching headers

## Configuration
- The default config is in `nginx.conf`. You can override it by mounting your own config.

## Example
```bash
docker run -v $(pwd)/site:/usr/share/nginx/html:ro -d -p 8080:80 unify-nginx
```

## Maintainer
fwdslsh/unify
