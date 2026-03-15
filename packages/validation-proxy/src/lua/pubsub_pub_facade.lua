-- Pubsub publish facade - lightweight proxy with validation delegation
-- Forwards requests to validation-service for topic and message validation, then to Kubo

local cjson = require "cjson"
local utils = require "proxy_utils"

-- Main facade logic
local function main()
    local ctx = utils.read_request_context()

    -- Check publish rate limits (30/minute)
    if not utils.check_rate_limit(ctx.client_ip, "pubsub_pub", 30) then
        return
    end

    -- Validate request via validation-service
    if not utils.validate_request({
        path = "/validate/pubsub/pub" .. ctx.query_string,
        body = ctx.body,
        headers = {
            ["Content-Type"] = "application/json",
            ["User-Agent"] = "nginx-security-facade/1.0"
        }
    }) then
        return
    end

    -- Forward to Kubo
    if utils.forward_to_kubo({
        path = "/api/v0/pubsub/pub" .. ctx.query_string,
        body = ctx.body,
        headers = {
            ["Content-Type"] = "application/json",
            ["User-Agent"] = "nginx-security-facade/1.0"
        },
        error_prefix = "Pubsub publish",
        default_error = cjson.encode({Message = cjson.encode({ValidationError = "Pubsub publish failed"})})
    }) then
        ngx.log(ngx.INFO, "Successful pubsub pub: ip=" .. ctx.client_ip)
    end
end

-- Set response headers
ngx.header.content_type = "application/json"

-- Execute main logic with error handling
local ok, err = pcall(main)
if not ok then
    ngx.log(ngx.ERR, "Pubsub pub facade error: " .. tostring(err))
    ngx.status = 500
    ngx.say(cjson.encode({Message = cjson.encode({ValidationError = "Internal server error"})}))
end