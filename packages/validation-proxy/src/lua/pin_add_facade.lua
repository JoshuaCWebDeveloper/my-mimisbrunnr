-- Pin/add facade - lightweight proxy with validation delegation
-- Forwards requests to validation-service for CID validation, then to Kubo

local cjson = require "cjson"
local utils = require "proxy_utils"

-- Main facade logic
local function main()
    local ctx = utils.read_request_context()

    -- Check daily quota
    if not utils.check_quota(ctx.client_ip, "pin_quota", PIN_QUOTA_DAILY) then
        return
    end

    -- Validate request via validation-service with content validation
    -- Add validate-content=true to enable content prefetch and schema validation
    local validation_query = ctx.query_string
    if validation_query == "" then
        validation_query = "?validate-content=true"
    else
        validation_query = validation_query .. "&validate-content=true"
    end

    if not utils.validate_request({
        path = "/validate/pin/add" .. validation_query
    }) then
        return
    end

    -- Build query string for Kubo with forced recursive=false
    local args = ngx.req.get_uri_args()
    args.recursive = "false"  -- Force recursive=false for security
    local kubo_query_string = utils.build_query_string(args)

    -- Forward to Kubo
    if utils.forward_to_kubo({
        path = "/api/v0/pin/add" .. kubo_query_string,
        error_prefix = "Pin request",
        default_error = cjson.encode({Message = cjson.encode({ValidationError = "Pin failed"})})
    }) then
        -- Increment quota only on successful pin
        utils.increment_quota(ctx.client_ip, "pin_quota")
        ngx.log(ngx.INFO, "Successful pin: ip=" .. ctx.client_ip)
    end
end

-- Set response headers
ngx.header.content_type = "application/json"

-- Execute main logic with error handling
local ok, err = pcall(main)
if not ok then
    ngx.log(ngx.ERR, "Pin facade error: " .. tostring(err))
    ngx.status = 500
    ngx.say(cjson.encode({
        Message = cjson.encode({ValidationError = "Internal server error"})
    }))
end