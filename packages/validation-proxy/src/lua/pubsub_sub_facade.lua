-- Pubsub subscribe facade with topic allowlisting and connection limits
-- Manages OrbitDB pubsub subscriptions securely

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

-- Check subscription limits per IP
local function check_subscription_limits(client_ip)
    local sub_key = "pubsub_sub:" .. client_ip
    local current_subs = ngx.shared.rate_store:get(sub_key) or 0
    
    if current_subs >= 2 then  -- Max 2 concurrent subscriptions per IP
        ngx.status = 429
        ngx.say('{"Message":"Maximum concurrent subscriptions exceeded","limit":2}')
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

-- Stream subscription with validation
local function stream_subscription(client_ip, topic)
    local httpc = http.new()
    httpc:set_timeout(0) -- Infinite timeout for streaming
    
    local ok, err = httpc:connect("kubo", 5001)
    if not ok then
        ngx.status = 502
        ngx.say('{"Message":"IPFS node unavailable"}')
        return false
    end
    
    -- Start subscription to Kubo
    local res, err = httpc:request({
        method = "POST",
        path = "/api/v0/pubsub/sub?arg=" .. ngx.escape_uri(topic),
        headers = {
            ["User-Agent"] = "nginx-security-facade/1.0"
        }
    })
    
    if not res then
        httpc:close()
        ngx.status = 502
        ngx.say('{"Message":"Pubsub subscription failed"}')
        return false
    end
    
    if res.status ~= 200 then
        local body = res:read_body()
        httpc:close()
        ngx.status = res.status
        ngx.say(body or '{"Message":"Subscription error"}')
        return false
    end
    
    -- Register active subscription
    register_subscription(client_ip, topic)
    
    -- Set streaming response headers
    ngx.header.content_type = "application/json"
    ngx.header.cache_control = "no-cache"
    ngx.header.connection = "keep-alive"
    ngx.status = 200
    
    -- Stream messages with validation
    local message_count = 0
    local start_time = ngx.now()
    
    repeat
        local chunk, err = res.body_reader(8192) -- 8KB chunks
        if chunk and chunk ~= "" then
            -- Validate message if it's complete JSON
            local lines = {}
            for line in chunk:gmatch("[^\r\n]+") do
                table.insert(lines, line)
            end
            
            for _, line in ipairs(lines) do
                if line:match("^{.*}$") then
                    -- Validate JSON message
                    local json_obj, parse_err = cjson.decode(line)
                    if json_obj then
                        -- Optional: validate message content
                        if json_obj.data then
                            -- Decode base64 data and validate if needed
                            -- For now, just pass through
                        end
                        message_count = message_count + 1
                    end
                end
                
                -- Forward message to client
                ngx.say(line)
                ngx.flush(true)
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
    
    ngx.log(ngx.INFO, "Pubsub subscription ended: topic=" .. topic .. " ip=" .. client_ip .. " messages=" .. message_count)
    
    return true
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
    
    -- Check subscription limits
    if not check_subscription_limits(client_ip) then
        return
    end
    
    -- Extract and validate topic
    local topic = ngx.var.arg_arg
    if not validate_topic(topic) then
        return
    end
    
    -- Start streaming subscription
    stream_subscription(client_ip, topic)
end

-- Execute main logic with error handling
local ok, err = pcall(main)
if not ok then
    ngx.log(ngx.ERR, "Pubsub sub facade error: " .. tostring(err))
    if not ngx.headers_sent then
        ngx.status = 500
        ngx.header.content_type = "application/json"
        ngx.say('{"Message":"Internal server error"}')
    end
end