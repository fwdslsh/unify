#!/bin/sh

# unify Docker entrypoint script
# Builds site and serves with NGINX, auto-rebuilding on changes

set -e

echo "🐳 Starting unify Docker container..."

# Check if site directory is mounted
if [ ! -d "/site" ]; then
    echo "❌ Error: No /site directory found. Please mount your site directory:"
    echo "   docker run -v \$(pwd)/mysite:/site unify"
    exit 1
fi

# Set default directories
SOURCE_DIR="/site"
OUTPUT_DIR="/var/www/html"

echo "📁 Source: $SOURCE_DIR"
echo "📁 Output: $OUTPUT_DIR"

# Initial build
echo "🔨 Building site..."
cd /site
unify build --source . --output "$OUTPUT_DIR"

if [ $? -eq 0 ]; then
    echo "✅ Initial build completed"
    
    # Debug: Show what was built
    echo "🔍 Debug: Files in output directory:"
    ls -la "$OUTPUT_DIR"
    echo "🔍 Debug: Contents of output directory:"
    find "$OUTPUT_DIR" -type f -exec ls -la {} \;
else
    echo "❌ Initial build failed"
    exit 1
fi

# Start NGINX in background
echo "🌐 Starting NGINX..."
nginx -g "daemon off;" &
NGINX_PID=$!

# Start file watcher for auto-rebuild
echo "👀 Starting file watcher for auto-rebuild..."
unify watch --source "$SOURCE_DIR" --output "$OUTPUT_DIR" &
WATCHER_PID=$!

# Cleanup function
cleanup() {
    echo ""
    echo "🛑 Shutting down..."
    if [ ! -z "$NGINX_PID" ]; then
        kill $NGINX_PID 2>/dev/null || true
    fi
    if [ ! -z "$WATCHER_PID" ]; then
        kill $WATCHER_PID 2>/dev/null || true
    fi
    exit 0
}

# Handle signals
trap cleanup TERM INT

echo "🚀 unify is running!"
echo "   📖 Site: http://localhost:8080/"
echo "   📁 Watching: $SOURCE_DIR"
echo "   🎯 Output: $OUTPUT_DIR"
echo ""
echo "Press Ctrl+C to stop"

# Wait for processes
wait