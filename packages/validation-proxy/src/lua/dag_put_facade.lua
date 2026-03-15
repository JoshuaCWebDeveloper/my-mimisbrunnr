-- DAG/put facade - lightweight proxy with validation delegation
-- Forwards requests to validation-service, then to Kubo based on validation result

local cjson = require "cjson"
local utils = require "proxy_utils"

-- Main facade logic
local function main()
    local ctx = utils.read_request_context()

    -- Check daily quota
    if not utils.check_quota(ctx.client_ip, "dag_quota", PIN_QUOTA_DAILY) then
        return
    end

    -- Validate request via validation-service
    if not utils.validate_request({
        path = "/validate/dag/put",
        body = ctx.body,
        headers = {
            ["Content-Type"] = ctx.content_type,
            ["X-Real-IP"] = ctx.client_ip,
            ["User-Agent"] = "nginx-security-facade/1.0"
        }
    }) then
        return
    end

    -- Build query string for Kubo
    local kubo_query_string = utils.build_query_string(ngx.req.get_uri_args())

    -- Forward to Kubo
    if utils.forward_to_kubo({
        path = "/api/v0/dag/put" .. kubo_query_string,
        body = ctx.body,
        headers = {
            ["Content-Type"] = ctx.content_type,
            ["User-Agent"] = "nginx-security-facade/1.0"
        },
        error_prefix = "DAG put request",
        default_error = cjson.encode({Message = cjson.encode({ValidationError = "DAG put failed"})})
    }) then
        -- Increment quota only on successful put
        utils.increment_quota(ctx.client_ip, "dag_quota")
        ngx.log(ngx.INFO, "Successful DAG put: ip=" .. ctx.client_ip .. " size=" .. #ctx.body)
    end
end

-- Set response headers
ngx.header.content_type = "application/json"

-- Execute main logic with error handling
local ok, err = pcall(main)
if not ok then
    ngx.log(ngx.ERR, "DAG put facade error: " .. tostring(err))
    ngx.status = 500
    local error_message = cjson.encode({
        Message = cjson.encode({ValidationError = "Internal server error"})
    })
    ngx.say(error_message)
end
