-- DAG/get facade - lightweight proxy with validation delegation
-- Forwards requests to validation-service for CID validation, then to Kubo

local cjson = require "cjson"
local utils = require "proxy_utils"

-- Main facade logic
local function main()
    local ctx = utils.read_request_context()

    -- Validate request via validation-service
    if not utils.validate_request({
        method = "GET",
        path = "/validate/dag/get" .. ctx.query_string
    }) then
        return
    end

    -- Forward to Kubo
    if utils.forward_to_kubo({
        method = ngx.var.request_method,
        path = "/api/v0/dag/get" .. ctx.query_string,
        content_type = "application/json",
        error_prefix = "DAG get request",
        default_error = cjson.encode({Message = cjson.encode({ValidationError = "DAG get failed"})})
    }) then
        ngx.log(ngx.INFO, "Successful DAG get: ip=" .. ctx.client_ip)
    end    
end

-- Set default response headers
ngx.header.content_type = "application/json"

-- Execute main logic with error handling
local ok, err = pcall(main)
if not ok then
    ngx.log(ngx.ERR, "DAG get facade error: " .. tostring(err))
    ngx.status = 500
    ngx.say(cjson.encode({Message = cjson.encode({ValidationError = "Internal server error"})}))
end