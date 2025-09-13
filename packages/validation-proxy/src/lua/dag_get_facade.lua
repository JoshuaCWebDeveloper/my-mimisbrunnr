-- DAG/get facade with size limits and content validation
-- Provides size-limited, schema-validated content retrieval

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
    
    -- Basic CID format validation
    if not string.match(cid, "^Qm[1-9A-HJ-NP-Za-km-z]{44}$") and
       not string.match(cid, "^b[a-z2-7]{58}$") then
        ngx.status = 400
        ngx.say('{"Message":"Invalid CID format"}')
        return nil
    end
    
    return cid
end

-- Stream content with size validation
local function stream_content_with_validation(cid)
    local httpc = http.new()
    httpc:set_timeout(KUBO_TIMEOUT)
    
    -- Connect to Kubo
    local ok, err = httpc:connect("kubo", 5001)
    if not ok then
        ngx.status = 502
        ngx.say('{"Message":"IPFS node unavailable"}')
        return false
    end
    
    -- Request content from Kubo
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
            ngx.status = res.status
            local body = res:read_body()
            ngx.say(body or '{"Message":"IPFS error"}')
        end
        return false
    end
    
    -- Stream response with size limit enforcement
    local total_size = 0
    local content_chunks = {}
    
    repeat
        local chunk, err = res.body_reader()
        if chunk then
            total_size = total_size + #chunk
            if total_size > MAX_CONTENT_SIZE then
                httpc:close()
                ngx.status = 413
                ngx.say('{"Message":"Content too large","limit":' .. MAX_CONTENT_SIZE .. ',"received":' .. total_size .. '}')
                return false
            end
            table.insert(content_chunks, chunk)
        end
    until not chunk
    
    httpc:close()
    
    -- Reconstruct full content
    local full_content = table.concat(content_chunks)
    
    -- Validate JSON structure
    local json_obj, err = cjson.decode(full_content)
    if not json_obj then
        ngx.status = 415
        ngx.say('{"Message":"Content is not valid JSON"}')
        return false
    end
    
    -- Optional: Schema validation (can be enabled via header)
    local validate_schema = ngx.var.http_x_validate_schema
    if validate_schema and validate_schema ~= "" then
        if not perform_schema_validation(json_obj, validate_schema) then
            return false
        end
    end
    
    -- Stream validated content to client
    ngx.status = 200
    ngx.header.content_type = "application/json"
    ngx.say(full_content)
    
    -- Log successful retrieval
    ngx.log(ngx.INFO, "Successful DAG get: cid=" .. cid .. " size=" .. total_size .. " ip=" .. ngx.var.remote_addr)
    
    return true
end

-- Perform schema validation via sidecar (optional)
local function perform_schema_validation(json_obj, schema_type)
    local httpc = http.new()
    httpc:set_timeout(VALIDATOR_TIMEOUT)
    
    local ok, err = httpc:connect("validator", 3000)
    if not ok then
        ngx.log(ngx.WARN, "Validator unavailable for DAG get validation")
        return true -- Continue without validation if validator is down
    end
    
    local validation_request = {
        schema = schema_type,
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
        ngx.status = 415
        ngx.say('{"Message":"Schema validation failed for DAG content"}')
        return false
    end
    
    return true
end

-- Main facade logic
local function main()
    -- Allow GET and POST methods
    if ngx.var.request_method ~= "GET" and ngx.var.request_method ~= "POST" then
        ngx.status = 405
        ngx.say('{"Message":"Method not allowed"}')
        return
    end
    
    -- Extract and validate CID
    local cid = get_cid_param()
    if not cid then
        return
    end
    
    -- Stream content with validation
    stream_content_with_validation(cid)
end

-- Set default response headers
ngx.header.content_type = "application/json"

-- Execute main logic with error handling
local ok, err = pcall(main)
if not ok then
    ngx.log(ngx.ERR, "DAG get facade error: " .. tostring(err))
    ngx.status = 500
    ngx.say('{"Message":"Internal server error"}')
end