-- Pin/add facade with comprehensive security validation
-- Validates CIDs, enforces size limits, performs schema validation

local cjson = require "cjson"
local http = require "resty.http"

-- Extract and validate CID parameter
local function get_cid_param()
    local cid = ngx.var.arg_arg
    if not cid then
        ngx.status = 400
        ngx.say('{"Message":"Missing required parameter: arg"}')
        return nil
    end
    
    -- Basic CID format validation (CIDv1 or CIDv0)
    if not string.match(cid, "^Qm[1-9A-HJ-NP-Za-km-z]{44}$") and
       not string.match(cid, "^b[a-z2-7]{58}$") then
        ngx.status = 400
        ngx.say('{"Message":"Invalid CID format"}')
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
        ngx.say('{"Message":"Daily pin quota exceeded","quota":' .. PIN_QUOTA_DAILY .. '}')
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
        ngx.say('{"Message":"IPFS node unavailable"}')
        return false
    end
    
    -- Prefetch root block only (no recursive traversal)
    local res, err = httpc:request({
        method = "GET",
        path = "/api/v0/dag/get?arg=" .. cid,
        headers = {
            ["User-Agent"] = "nginx-security-facade/1.0"
        }
    })
    
    if not res then
        httpc:close()
        ngx.status = 502
        ngx.say('{"Message":"Failed to fetch content"}')
        return false
    end
    
    if res.status ~= 200 then
        httpc:close()
        if res.status == 404 then
            ngx.status = 404
            ngx.say('{"Message":"Content not found"}')
        else
            ngx.status = 502
            ngx.say('{"Message":"IPFS error: ' .. (res.reason or "unknown") .. '"}')
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
                ngx.status = 413
                ngx.say('{"Message":"Content too large","limit":' .. MAX_CONTENT_SIZE .. '}')
                return false
            end
            body = body .. chunk
        end
    until not chunk
    
    httpc:close()
    
    -- Attempt JSON parsing
    local json_obj, err = cjson.decode(body)
    if not json_obj then
        ngx.status = 415
        ngx.say('{"Message":"Content is not valid JSON"}')
        return false
    end
    
    return json_obj
end

-- Validate JSON against schema via sidecar
local function validate_schema(json_obj)
    local httpc = http.new()
    httpc:set_timeout(VALIDATOR_TIMEOUT)
    
    local ok, err = httpc:connect("validation-service", 3000)
    if not ok then
        ngx.status = 502
        ngx.say('{"Message":"Validator service unavailable"}')
        return false
    end
    
    local validation_request = {
        schema = "taglist/v1",
        json = json_obj
    }
    
    local res, err = httpc:request({
        method = "POST",
        path = "/validate",
        headers = {
            ["Content-Type"] = "application/json",
            ["User-Agent"] = "nginx-security-facade/1.0"
        },
        body = cjson.encode(validation_request)
    })
    
    httpc:close()
    
    if not res then
        ngx.status = 502
        ngx.say('{"Message":"Validation failed"}')
        return false
    end
    
    if res.status ~= 200 then
        local error_body = res:read_body()
        ngx.status = 415
        ngx.say(error_body or '{"Message":"Schema validation failed"}')
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
        ngx.say('{"Message":"IPFS node unavailable"}')
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
        ngx.say('{"Message":"Pin request failed"}')
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
        ngx.say(body or '{"Message":"Pin failed"}')
    end
    
    return res.status == 200
end

-- Main facade logic
local function main()
    local client_ip = ngx.var.remote_addr
    
    -- Only allow POST method
    if ngx.var.request_method ~= "POST" then
        ngx.status = 405
        ngx.say('{"Message":"Method not allowed"}')
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
    ngx.say('{"Message":"Internal server error"}')
end