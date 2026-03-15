-- Proxy utilities - shared functions for validation facades
-- Provides reusable functions for rate limiting, quota management, and request forwarding

local cjson = require "cjson"
local http = require "resty.http"

local _M = {}

-- Rate limiting: check and increment per-minute counter
function _M.check_rate_limit(client_ip, prefix, limit)
    local rate_key = prefix .. ":" .. client_ip .. ":" .. math.floor(ngx.now() / 60)
    local current_count = ngx.shared.rate_store:get(rate_key) or 0

    if current_count >= limit then
        ngx.status = 429
        ngx.say(cjson.encode({
            Message = cjson.encode({ValidationError = "Rate limit exceeded"}),
            limit = limit
        }))
        return false
    end

    ngx.shared.rate_store:set(rate_key, current_count + 1, 120) -- 2 minute TTL
    return true
end

-- Quota management: check daily quota
function _M.check_quota(client_ip, prefix, limit)
    local quota_key = prefix .. ":" .. client_ip .. ":" .. os.date("%Y-%m-%d")
    local current_count = ngx.shared.rate_store:get(quota_key) or 0

    if current_count >= limit then
        ngx.status = 429
        ngx.say(cjson.encode({
            Message = cjson.encode({
                ValidationError = "Daily quota exceeded (limit: " .. limit .. ")"
            })
        }))
        return false
    end

    return true
end

-- Quota management: increment daily quota
function _M.increment_quota(client_ip, prefix)
    local quota_key = prefix .. ":" .. client_ip .. ":" .. os.date("%Y-%m-%d")
    local current_count = ngx.shared.rate_store:get(quota_key) or 0
    ngx.shared.rate_store:set(quota_key, current_count + 1, 86400) -- 24 hour TTL
end

-- Read request context (body, query string, headers)
function _M.read_request_context()
    ngx.req.read_body()
    return {
        body = ngx.req.get_body_data() or "",
        query_string = ngx.var.args and ("?" .. ngx.var.args) or "",
        headers = ngx.req.get_headers(),
        client_ip = ngx.var.remote_addr,
        content_type = ngx.var.content_type
    }
end

-- Build query string from args table
function _M.build_query_string(args)
    local query_params = {}
    for key, val in pairs(args) do
        if type(val) == "table" then
            for _, v in ipairs(val) do
                table.insert(query_params, key .. "=" .. ngx.escape_uri(v))
            end
        else
            table.insert(query_params, key .. "=" .. ngx.escape_uri(val))
        end
    end
    if #query_params > 0 then
        return "?" .. table.concat(query_params, "&")
    end
    return ""
end

-- Forward request to validation-service
-- Returns true if validation passes (200), false otherwise
function _M.validate_request(opts)
    local httpc = http.new()
    httpc:set_timeout(VALIDATOR_TIMEOUT)

    local ok, err = httpc:connect("validation-service", 3000)
    if not ok then
        ngx.status = 502
        ngx.say(cjson.encode({
            Message = cjson.encode({ValidationError = "Validation service unavailable: " .. (err or "unknown error")})
        }))
        httpc:close()
        return false
    end

    -- Build request to validation-service
    local req_opts = {
        method = opts.method or "POST",
        path = opts.path,
        headers = opts.headers or {
            ["User-Agent"] = "nginx-security-facade/1.0"
        }
    }

    if opts.body then
        req_opts.body = opts.body
    end

    local res, err = httpc:request(req_opts)

    if not res then
        httpc:close()
        ngx.status = 502
        ngx.say(cjson.encode({
            Message = cjson.encode({ValidationError = "Validation request failed: " .. (err or "unknown error")})
        }))
        return false
    end

    local response_body = res:read_body()
    httpc:close()

    -- If validation fails, return validation-service's error response
    if res.status ~= 200 then
        ngx.status = res.status
        ngx.say(response_body)
        return false
    end

    return true
end

-- Forward request to Kubo
-- Returns true if request succeeds (200), false otherwise
function _M.forward_to_kubo(opts)
    local httpc = http.new()
    httpc:set_timeout(KUBO_TIMEOUT)

    local ok, err = httpc:connect("kubo", 5001)
    if not ok then
        ngx.status = 502
        ngx.say(cjson.encode({
            Message = cjson.encode({ValidationError = "IPFS node unavailable: " .. (err or "unknown error")})
        }))
        httpc:close()
        return false
    end

    -- Build request to Kubo
    local req_opts = {
        method = opts.method or "POST",
        path = opts.path,
        headers = opts.headers or {
            ["User-Agent"] = "nginx-security-facade/1.0"
        }
    }

    if opts.body then
        req_opts.body = opts.body
    end

    local res, err = httpc:request(req_opts)

    if not res then
        httpc:close()
        ngx.status = 502
        ngx.say(cjson.encode({
            Message = cjson.encode({ValidationError = (opts.error_prefix or "Request") .. " failed: " .. (err or "unknown error")})
        }))
        return false
    end

    local response_body = res:read_body()
    httpc:close()

    -- Relay Kubo response
    ngx.status = res.status
    if opts.content_type then
        ngx.header.content_type = opts.content_type
    end
    ngx.say(response_body or (opts.default_error or cjson.encode({Message = cjson.encode({ValidationError = "Request failed"})})))

    return res.status == 200
end

return _M
