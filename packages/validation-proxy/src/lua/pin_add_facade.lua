-- Pin/add facade with comprehensive security validation
-- Validates CIDs, enforces size limits, performs schema validation

local cjson = require "cjson"
local http = require "resty.http"
local validator = require "content_validation"

-- Extract and validate CID parameter
local function get_cid_param()
    local cid = ngx.var.arg_arg
    if not cid then
        validator.send_error(400, "Missing required parameter: arg")
        return nil
    end

    -- Basic CID format validation (CIDv0 or CIDv1)
    if not validator.is_valid_cid(cid) then
        validator.send_error(400, "Invalid CID format")
        return nil
    end

    return cid
end

-- Check daily pin quota for IP
local function check_pin_quota(client_ip)
    local quota_key = "pin_quota:" .. client_ip .. ":" .. os.date("%Y-%m-%d")
    local current_count = ngx.shared.rate_store:get(quota_key) or 0
    
    if current_count >= PIN_QUOTA_DAILY then
        ngx.status = 429
        local error_message = cjson.encode({
            Message = cjson.encode({ValidationError = "Daily pin quota exceeded", quota = PIN_QUOTA_DAILY})
        })
        ngx.say(error_message)
        return false
    end
    
    return true
end

-- Increment daily pin quota
local function increment_pin_quota(client_ip)
    local quota_key = "pin_quota:" .. client_ip .. ":" .. os.date("%Y-%m-%d")
    local current_count = ngx.shared.rate_store:get(quota_key) or 0
    ngx.shared.rate_store:set(quota_key, current_count + 1, 86400) -- 24 hour TTL
end

-- Prefetch and validate content
local function validate_content(cid)
    local httpc = http.new()
    httpc:set_timeout(KUBO_TIMEOUT)
    
    -- Connect to Kubo
    local ok, err = httpc:connect("kubo", 5001)
    if not ok then
        ngx.status = 502
        local error_message = cjson.encode({
            Message = cjson.encode({ValidationError = "IPFS node unavailable", error = err})
        })
        ngx.say(error_message)
        return false
    end
    
    -- Prefetch root block only (no recursive traversal)
    local res, err = httpc:request({
        method = "POST",
        path = "/api/v0/dag/get?arg=" .. cid,
        headers = {
            ["User-Agent"] = "nginx-security-facade/1.0"
        }
    })
    
    if not res then
        httpc:close()
        ngx.status = 502
        local error_message = cjson.encode({
            Message = cjson.encode({ValidationError = "Failed to fetch content for validation", error = err})
        })
        ngx.say(error_message)
        return false
    end
    
    if res.status ~= 200 then
        httpc:close()
        if res.status == 404 then
            ngx.status = 404
            local error_message = cjson.encode({
                Message = cjson.encode({ValidationError = "Content not found for validation"})
            })
            ngx.say(error_message)
        else
            ngx.status = 502
            local error_message = cjson.encode({
                Message = cjson.encode({ValidationError = "IPFS error during content validation: " .. (res.reason or "unknown")})
            })
            ngx.say(error_message)
        end
        return false
    end
    
    -- Read response body with size limit
    local body = ""
    local total_size = 0

    repeat
        local chunk, err = res.body_reader()
        if chunk then
            total_size = total_size + #chunk
            if total_size > MAX_CONTENT_SIZE then
                httpc:close()
                validator.send_error(413, "Content too large (max: " .. MAX_CONTENT_SIZE .. " bytes)")
                return false
            end
            body = body .. chunk
        end
    until not chunk

    httpc:close()

    -- Validate and parse JSON
    local json_obj, err = validator.validate_and_parse_json(body, MAX_CONTENT_SIZE)
    if not json_obj then
        validator.send_error(415, err)
        return false
    end

    return json_obj
end

-- Validate JSON against schema via sidecar
local function validate_schema(json_obj)
    local success, err = validator.validate_schema(json_obj, "data/write/v1")
    if not success then
        validator.send_error(415, err)
        return false
    end
    return true
end

-- Delegate to Kubo for actual pinning
local function delegate_to_kubo(cid)
    local httpc = http.new()
    httpc:set_timeout(KUBO_TIMEOUT)
    
    local ok, err = httpc:connect("kubo", 5001)
    if not ok then
        ngx.status = 502
        local error_message = cjson.encode({
            Message = cjson.encode({ValidationError = "IPFS node unavailable", error = err})
        })
        ngx.say(error_message)
        return false
    end
    
    -- Force recursive=false for security (pin only root block)
    local res, err = httpc:request({
        method = "POST",
        path = "/api/v0/pin/add?arg=" .. cid .. "&recursive=false",
        headers = {
            ["User-Agent"] = "nginx-security-facade/1.0"
        }
    })
    
    if not res then
        httpc:close()
        ngx.status = 502
        local error_message = cjson.encode({
            Message = cjson.encode({ValidationError = "Pin request failed", error = err})
        })
        ngx.say(error_message)
        return false
    end
    
    local body = res:read_body()
    httpc:close()
    
    -- Relay Kubo response
    ngx.status = res.status
    if res.status == 200 then
        -- Normalize successful response format
        ngx.say('{"Pins":["' .. cid .. '"]}')
    else
        local error_message = cjson.encode({
            Message = cjson.encode({ValidationError = "Pin failed"})
        })
        ngx.say(body or error_message)
    end
    
    return res.status == 200
end

-- Main facade logic
local function main()
    local client_ip = ngx.var.remote_addr
    
    -- Only allow POST method
    if ngx.var.request_method ~= "POST" then
        ngx.status = 405
        local error_message = cjson.encode({
            Message = cjson.encode({ValidationError = "Method not allowed"})
        })
        ngx.say(error_message)
        return
    end
    
    -- Check daily quota
    if not check_pin_quota(client_ip) then
        return
    end
    
    -- Extract and validate CID
    local cid = get_cid_param()
    if not cid then
        return
    end
    
    -- Validate content and get JSON
    local json_obj = validate_content(cid)
    if not json_obj then
        return
    end
    
    -- Validate against schema
    if not validate_schema(json_obj) then
        return
    end
    
    -- All validations passed, delegate to Kubo
    if delegate_to_kubo(cid) then
        -- Increment quota only on successful pin
        increment_pin_quota(client_ip)
        
        -- Log successful pin for monitoring
        ngx.log(ngx.INFO, "Successful pin: cid=" .. cid .. " ip=" .. client_ip)
    end
end

-- Set response headers
ngx.header.content_type = "application/json"

-- Execute main logic with error handling
local ok, err = pcall(main)
if not ok then
    ngx.log(ngx.ERR, "Pin facade error: " .. tostring(err))
    ngx.status = 500
    local error_message = cjson.encode({
        Message = cjson.encode({ValidationError = "Internal server error"})
    })
    ngx.say(error_message)
end