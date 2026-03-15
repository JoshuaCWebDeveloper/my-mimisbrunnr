-- Routing/put facade - lightweight proxy with validation delegation
-- Forwards IPNS record requests to validation-service, then to Kubo DHT

local cjson = require "cjson"
local utils = require "proxy_utils"

-- Main facade logic
local function main()
    local ctx = utils.read_request_context()

    -- Extract peer ID from query parameter
    local args = ngx.req.get_uri_args()
    local peer_id = args.arg and string.match(args.arg, "^/ipns/(.+)$")

    -- Validate request via validation-service
    if not utils.validate_request({
        path = "/validate/ipns/" .. (peer_id or ""),
        body = ctx.body,
        headers = {
            ["Content-Type"] = ctx.headers["Content-Type"],
            ["User-Agent"] = "nginx-security-facade/1.0"
        }
    }) then
        return
    end

    -- Forward to Kubo
    if utils.forward_to_kubo({
        path = "/api/v0/routing/put" .. ctx.query_string,
        body = ctx.body,
        headers = {
            ["Content-Type"] = ctx.headers["Content-Type"],
            ["User-Agent"] = "nginx-security-facade/1.0"
        },
        error_prefix = "Routing put request",
        default_error = cjson.encode({Message = cjson.encode({ValidationError = "IPNS record publishing failed"})})
    }) then
        ngx.log(ngx.INFO, "Successful IPNS record publish: peer_id=" .. (peer_id or "unknown") .. " ip=" .. ctx.client_ip)
    end
end

-- Set response headers
ngx.header.content_type = "application/json"

-- Execute main logic with error handling
local ok, err = pcall(main)
if not ok then
    ngx.log(ngx.ERR, "Routing put facade error: " .. tostring(err))
    ngx.status = 500
    ngx.say(cjson.encode({
        Message = cjson.encode({ValidationError = "Internal server error"})
    }))
end
