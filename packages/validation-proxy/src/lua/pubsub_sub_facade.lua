-- Pubsub subscribe facade - lightweight proxy with validation delegation
-- Forwards requests to validation-service for topic validation, then streams from Kubo

local cjson = require "cjson"
local http = require "resty.http"
local utils = require "proxy_utils"

-- Check subscription limits per IP (connection limit)
local function check_subscription_limits(client_ip)
    local sub_key = "pubsub_sub:" .. client_ip
    local current_subs = ngx.shared.rate_store:get(sub_key) or 0

    if current_subs >= 2 then  -- Max 2 concurrent subscriptions per IP
        ngx.status = 429
        ngx.say(cjson.encode({Message = cjson.encode({ValidationError = "Maximum concurrent subscriptions exceeded","limit":2})}))
        return false
    end

    return true
end

-- Register active subscription
local function register_subscription(client_ip, topic)
    local sub_key = "pubsub_sub:" .. client_ip
    local current_subs = ngx.shared.rate_store:get(sub_key) or 0
    ngx.shared.rate_store:set(sub_key, current_subs + 1, 300) -- 5 minute TTL

    -- Track specific subscription for cleanup
    local specific_key = "pubsub_sub:" .. client_ip .. ":" .. topic
    ngx.shared.rate_store:set(specific_key, ngx.now(), 300)
end

-- Unregister subscription (called on connection close)
local function unregister_subscription(client_ip, topic)
    local sub_key = "pubsub_sub:" .. client_ip
    local current_subs = ngx.shared.rate_store:get(sub_key) or 0
    if current_subs > 0 then
        ngx.shared.rate_store:set(sub_key, current_subs - 1, 300)
    end

    local specific_key = "pubsub_sub:" .. client_ip .. ":" .. topic
    ngx.shared.rate_store:delete(specific_key)
end

-- Stream subscription from Kubo
local function stream_subscription(client_ip, topic)
    local httpc = http.new()
    httpc:set_timeout(0) -- Infinite timeout for streaming

    local ok, err = httpc:connect("kubo", 5001)
    if not ok then
        ngx.status = 502
        ngx.say(cjson.encode({Message = cjson.encode({ValidationError = "IPFS node unavailable: " .. (err or "unknown error")})}))
        return false
    end

    -- Build query string from request args
    local query_string = ngx.var.args and ("?" .. ngx.var.args) or ""

    -- Start subscription to Kubo
    local res, err = httpc:request({
        method = "POST",
        path = "/api/v0/pubsub/sub" .. query_string,
        headers = {
            ["User-Agent"] = "nginx-security-facade/1.0"
        }
    })

    if not res then
        httpc:close()
        ngx.status = 502
        ngx.say(cjson.encode({Message = cjson.encode({ValidationError = "Pubsub subscription failed: " .. (err or "unknown error")})}))
        return false
    end

    if res.status ~= 200 then
        local body = res:read_body()
        httpc:close()
        ngx.status = res.status
        ngx.say(body or cjson.encode({Message = cjson.encode({ValidationError = "Subscription error"})}))
        return false
    end

    -- Register active subscription
    register_subscription(client_ip, topic)

    -- Set streaming response headers
    ngx.header.content_type = "application/json"
    ngx.header.cache_control = "no-cache"
    ngx.header.connection = "keep-alive"
    ngx.status = 200

    -- Stream messages
    local message_count = 0
    local start_time = ngx.now()

    repeat
        local chunk, err = res.body_reader(8192) -- 8KB chunks
        if chunk and chunk ~= "" then
            -- Forward chunk to client
            ngx.print(chunk)
            ngx.flush(true)

            -- Count messages for logging
            for line in chunk:gmatch("[^\r\n]+") do
                if line:match("^{.*}$") then
                    message_count = message_count + 1
                end
            end
        end

        -- Check for client disconnect
        if ngx.var.connection_close then
            break
        end

        -- Timeout check (max 2 minutes idle)
        if ngx.now() - start_time > 120 then
            break
        end

    until not chunk or err

    -- Clean up
    httpc:close()
    unregister_subscription(client_ip, topic)

    ngx.log(ngx.INFO, "Pubsub subscription ended: ip=" .. client_ip .. " messages=" .. message_count)

    return true
end

-- Main facade logic
local function main()
    local ctx = utils.read_request_context()

    -- Check subscription limits
    if not check_subscription_limits(ctx.client_ip) then
        return
    end

    -- Validate request via validation-service
    if not utils.validate_request({
        path = "/validate/pubsub/sub" .. ctx.query_string
    }) then
        return
    end

    -- Extract topic for tracking
    local topic = ngx.var.arg_arg or "unknown"

    -- Start streaming subscription
    stream_subscription(ctx.client_ip, topic)
end

-- Execute main logic with error handling
local ok, err = pcall(main)
if not ok then
    ngx.log(ngx.ERR, "Pubsub sub facade error: " .. tostring(err))
    if not ngx.headers_sent then
        ngx.status = 500
        ngx.header.content_type = "application/json"
        ngx.say(cjson.encode({Message = cjson.encode({ValidationError = "Internal server error"})}))
    end
end