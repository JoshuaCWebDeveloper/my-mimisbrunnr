-- Routing/put facade for IPNS record publishing with validation
-- Validates IPNS records before forwarding to Kubo DHT

local cjson = require "cjson"
local http = require "resty.http"
local validator = require "content_validation"

-- Extract IPNS key from query parameter
local function extract_ipns_key()
    local args = ngx.req.get_uri_args()
    local arg = args.arg

    if not arg then
        validator.send_error(400, "Missing 'arg' parameter")
        return nil
    end

    -- Validate IPNS key format: /ipns/<peer-id>
    local peer_id = string.match(arg, "^/ipns/(.+)$")
    if not peer_id then
        validator.send_error(400, "Invalid IPNS key format. Expected: /ipns/<peer-id>, received: " .. arg)
        return nil
    end

    return peer_id
end

-- Read IPNS record from request body
local function read_ipns_record()
    ngx.req.read_body()
    local body = ngx.req.get_body_data()

    if not body then
        -- Check if body was buffered to disk
        local body_file = ngx.req.get_body_file()
        if body_file then
            validator.send_error(413, "Request body too large (buffered to disk)")
            return nil
        end
        validator.send_error(400, "Missing request body")
        return nil
    end

    -- Validate size
    if #body > 10240 then  -- 10KB limit for IPNS records
        validator.send_error(413, "IPNS record too large (max 10KB)")
        return nil
    end

    return body
end

-- Validate IPNS record via validation-service
local function validate_ipns_record(peer_id, record_bytes)
        -- VAlidate IPNS peer id format
    if not validator.is_valid_ipns_peer_id(peer_id) then
        validator.send_error(400, "Invalid IPNS peer id format. Received: " .. peer_id)
        return false
    end

    local httpc = http.new()
    httpc:set_timeout(VALIDATOR_TIMEOUT)

    local ok, err = httpc:connect("validation-service", 3000)
    if not ok then
        validator.send_error(502, "Validation service unavailable: " .. (err or "unknown error"))
        return false
    end

    -- Send IPNS record to validation service for verification
    local headers = ngx.req.get_headers()
    local res, err = httpc:request({
        method = "POST",
        path = "/validate/ipns/" .. peer_id,
        headers = {
            ["Content-Type"] = headers["Content-Type"],
            ["User-Agent"] = "nginx-security-facade/1.0"
        },
        body = record_bytes
    })

    if not res then
        httpc:close()
        validator.send_error(502, "IPNS validation request failed: " .. (err or "unknown error"))
        return false
    end

    local response_body = res:read_body()
    httpc:close()

    if res.status ~= 200 then
        validator.send_error(400, response_body)
        return false
    end

    return true
end

-- Forward validated IPNS record to Kubo DHT
local function forward_to_kubo(peer_id, record_bytes)
    local httpc = http.new()
    httpc:set_timeout(KUBO_TIMEOUT)

    local ok, err = httpc:connect("kubo", 5001)
    if not ok then
        validator.send_error(502, "IPFS node unavailable: " .. (err or "unknown error"))
        return false
    end

    -- Forward to Kubo's routing/put endpoint
    local headers = ngx.req.get_headers()
    local query_string = ngx.var.args and ("?" .. ngx.var.args) or ""
    local res, err = httpc:request({
        method = "POST",
        path = "/api/v0/routing/put" .. query_string,
        headers = {
            ["Content-Type"] = headers["Content-Type"],
            ["User-Agent"] = "nginx-security-facade/1.0"
        },
        body = record_bytes

    })

    if not res then
        httpc:close()
        validator.send_error(502, "Routing put request failed: " .. (err or "unknown error"))
        return false
    end

    local response_body = res:read_body()
    httpc:close()

    -- Relay Kubo response
    ngx.status = res.status
    if res.status == 200 then
        ngx.say(response_body or '{"Message":"IPNS record published successfully"}')
        return true
    else
        ngx.say(response_body or '{"Message":"IPNS record publishing failed"}')
        return false
    end
end

-- Main facade logic
local function main()
    local client_ip = ngx.var.remote_addr

    -- Only allow POST method
    if ngx.var.request_method ~= "POST" then
        validator.send_error(405, "Method not allowed")
        return
    end

    -- Extract IPNS key from query parameter
    local peer_id = extract_ipns_key()
    if not peer_id then
        return
    end

    -- Read IPNS record from request body
    local record_bytes = read_ipns_record()
    if not record_bytes then
        return
    end

    -- Validate IPNS record via validation-service
    if not validate_ipns_record(peer_id, record_bytes) then
        return
    end

    -- All validations passed - forward to Kubo DHT
    if not forward_to_kubo(peer_id, record_bytes) then
        return
    end

    ngx.log(ngx.INFO, "Successful IPNS record publish: peer_id=" .. peer_id .. " ip=" .. client_ip)
end

-- Set response headers
ngx.header.content_type = "application/json"

-- Execute main logic with error handling
local ok, err = pcall(main)
if not ok then
    ngx.log(ngx.ERR, "Routing put facade error: " .. tostring(err))
    ngx.status = 500
    local error_message = cjson.encode({
        Message = "Internal server error"
    })
    ngx.say(error_message)
end
