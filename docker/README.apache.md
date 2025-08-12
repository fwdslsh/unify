# Unify Apache Container

This image provides an Apache HTTP server configured for use with the Unify static site generator. It is intended for serving static sites with SSI includes and optimized caching.

## Usage

```bash
# Build the image
docker build -f Dockerfile.apache -t unify-apache .

# Run the container
docker run -d -p 8080:80 unify-apache
```

## Features
- Apache SSI support
- Custom configuration via `apache.conf`
- Optimized for static HTML/CSS/JS

## Configuration
- The default config is in `apache.conf`. You can override it by mounting your own config.

## Example
```bash
docker run -v $(pwd)/site:/usr/local/apache2/htdocs:ro -d -p 8080:80 unify-apache
```

## Maintainer
fwdslsh/unify
