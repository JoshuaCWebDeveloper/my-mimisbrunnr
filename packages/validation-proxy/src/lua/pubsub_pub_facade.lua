-- Pubsub publish facade with topic allowlisting and content validation
-- Validates OrbitDB pubsub messages for security

local cjson = require "cjson"
local http = require "resty.http"

-- Validate topic against allowlist
local function validate_topic(topic)
    if not topic or topic == "" then
        ngx.status = 400
        ngx.say('{"Message":"Missing required parameter: arg (topic)"}')
        return false
    end
    
    -- Topic allowlist pattern: mimis/(taglist|discovery)/[a-z0-9-]{1,64}
    if not string.match(topic, "^mimis/(taglist|discovery)/[a-z0-9%-]{1,64}$") then
        ngx.status = 403
        ngx.say('{"Message":"Topic not allowed","topic":"' .. topic .. '"}')
        return false
    end
    
    return true
end

-- Validate message content
local function validate_message_content()
    -- Read request body
    ngx.req.read_body()
    local body_data = ngx.req.get_body_data()
    
    if not body_data then
        ngx.status = 400
        ngx.say('{"Message":"Missing message content"}')
        return nil
    end
    
    -- Check size limit
    if #body_data > MAX_JSON_SIZE then
        ngx.status = 413
        ngx.say('{"Message":"Message too large","limit":' .. MAX_JSON_SIZE .. ',"size":' .. #body_data .. '}')
        return nil
    end
    
    -- Validate JSON structure
    local json_obj, err = cjson.decode(body_data)
    if not json_obj then
        ngx.status = 400
        ngx.say('{"Message":"Message must be valid JSON"}')
        return nil
    end
    
    return json_obj, body_data
end

-- Validate against pubsub schema
local function validate_pubsub_schema(json_obj)
    local httpc = http.new()
    httpc:set_timeout(VALIDATOR_TIMEOUT)
    
    local ok, err = httpc:connect("validation-service", 3000)
    if not ok then
        -- Allow message without validation if validator is down
        ngx.log(ngx.WARN, "Validator unavailable for pubsub validation")
        return true
    end
    
    local validation_request = {
        schema = "pubsub/head/v1",
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
    
    if not res or res.status ~= 200 then
        local error_body = res and res:read_body() or "Validation failed"
        ngx.status = 415
        ngx.say(error_body)
        return false
    end
    
    return true
end

-- Check publish rate limits per IP
local function check_publish_rate_limit(client_ip)
    local rate_key = "pubsub_pub:" .. client_ip .. ":" .. math.floor(ngx.now() / 60)
    local current_count = ngx.shared.rate_store:get(rate_key) or 0
    
    if current_count >= 30 then  -- 30 publishes per minute
        ngx.status = 429
        ngx.say('{"Message":"Publish rate limit exceeded"}')
        return false
    end
    
    ngx.shared.rate_store:set(rate_key, current_count + 1, 120) -- 2 minute TTL
    return true
end

-- Delegate to Kubo pubsub
local function delegate_to_kubo(topic, message_data)
    local httpc = http.new()
    httpc:set_timeout(KUBO_TIMEOUT)
    
    local ok, err = httpc:connect("kubo", 5001)
    if not ok then
        ngx.status = 502
        ngx.say('{"Message":"IPFS node unavailable"}')
        return false
    end
    
    -- Forward to Kubo pubsub/pub
    local res, err = httpc:request({
        method = "POST",
        path = "/api/v0/pubsub/pub?arg=" .. ngx.escape_uri(topic),
        headers = {
            ["Content-Type"] = "application/json",
            ["User-Agent"] = "nginx-security-facade/1.0"
        },
        body = message_data
    })
    
    if not res then
        httpc:close()
        ngx.status = 502
        ngx.say('{"Message":"Pubsub publish failed"}')
        return false
    end
    
    local body = res:read_body()
    httpc:close()
    
    -- Relay Kubo response
    ngx.status = res.status
    ngx.say(body or '{}')
    
    if res.status == 200 then
        ngx.log(ngx.INFO, "Successful pubsub pub: topic=" .. topic .. " ip=" .. ngx.var.remote_addr)
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
    
    -- Check publish rate limits
    if not check_publish_rate_limit(client_ip) then
        return
    end
    
    -- Extract and validate topic
    local topic = ngx.var.arg_arg
    if not validate_topic(topic) then
        return
    end
    
    -- Validate message content
    local json_obj, message_data = validate_message_content()
    if not json_obj then
        return
    end
    
    -- Validate against pubsub schema
    if not validate_pubsub_schema(json_obj) then
        return
    end
    
    -- All validations passed, delegate to Kubo
    delegate_to_kubo(topic, message_data)
end

-- Set response headers
ngx.header.content_type = "application/json"

-- Execute main logic with error handling
local ok, err = pcall(main)
if not ok then
    ngx.log(ngx.ERR, "Pubsub pub facade error: " .. tostring(err))
    ngx.status = 500
    ngx.say('{"Message":"Internal server error"}')
end