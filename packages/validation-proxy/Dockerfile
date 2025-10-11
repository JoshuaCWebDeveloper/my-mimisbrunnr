# Validation Proxy - OpenResty with embedded configuration
FROM openresty/openresty:1.21.4.2-alpine-fat

# Install curl for healthchecks
RUN apk add --no-cache curl

# Install the maintained fork of lua-resty-http
RUN opm install ledgetech/lua-resty-http=0.17.1

# Copy nginx configuration
COPY packages/validation-proxy/src/nginx.conf /usr/local/openresty/nginx/conf/nginx.conf

# Copy Lua facade scripts
COPY packages/validation-proxy/src/lua /usr/local/openresty/nginx/conf/lua

# Expose ports
EXPOSE 5001 8080

# Use default openresty entrypoint
CMD ["/usr/local/openresty/bin/openresty", "-g", "daemon off;"]
