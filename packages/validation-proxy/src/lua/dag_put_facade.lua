-- DAG/put facade with comprehensive security validation
-- Validates incoming content before storing in IPFS

local cjson = require "cjson"
local http = require "resty.http"
local validator = require "content_validation"

-- Check daily DAG put quota for IP
local function check_dag_quota(client_ip)
    local quota_key = "dag_quota:" .. client_ip .. ":" .. os.date("%Y-%m-%d")
    local current_count = ngx.shared.rate_store:get(quota_key) or 0

    if current_count >= PIN_QUOTA_DAILY then
        validator.send_error(429, "Daily DAG put quota exceeded (limit: " .. PIN_QUOTA_DAILY .. ")")
        return false
    end

    return true
end

-- Increment daily DAG put quota
local function increment_dag_quota(client_ip)
    local quota_key = "dag_quota:" .. client_ip .. ":" .. os.date("%Y-%m-%d")
    local current_count = ngx.shared.rate_store:get(quota_key) or 0
    ngx.shared.rate_store:set(quota_key, current_count + 1, 86400) -- 24 hour TTL
end

-- Extract file content from multipart form data
local function extract_multipart_file()
    ngx.req.read_body()
    local body = ngx.req.get_body_data()

    if not body then
        -- Check if body was buffered to disk
        local body_file = ngx.req.get_body_file()
        if body_file then
            validator.send_error(413, "Request body too large (buffered to disk)")
            return nil, nil
        end
        validator.send_error(400, "Missing request body")
        return nil, nil
    end

    -- Extract content-type boundary
    local content_type = ngx.var.content_type
    if not content_type or not string.find(content_type, "multipart/form%-data") then
        validator.send_error(400, "Content-Type must be multipart/form-data")
        return nil, nil
    end

    local boundary = string.match(content_type, "boundary=([^;]+)")
    if not boundary then
        validator.send_error(400, "Missing boundary in Content-Type")
        return nil, nil
    end

    -- Simple multipart parsing - extract content between boundaries
    -- Looking for the file content after headers
    local file_content = string.match(body, "\r\n\r\n(.-)\r\n%-%-" .. boundary)
    if not file_content then
        validator.send_error(400, "Could not extract file content from multipart data")
        return nil, nil
    end

    -- Validate and parse JSON
    local json_obj, err = validator.validate_and_parse_json(file_content, MAX_CONTENT_SIZE)
    if not json_obj then
        validator.send_error(415, err)
        return nil, nil
    end

    return json_obj, body
end

-- Validate JSON against schema via sidecar
local function validate_schema(json_obj)
    local success, err = validator.validate_schema(json_obj, "taglist/v1")
    if not success then
        validator.send_error(415, err)
        return false
    end
    return true
end

-- Delegate to Kubo for actual DAG put (forward original multipart body)
local function delegate_to_kubo(multipart_body)
    local httpc = http.new()
    httpc:set_timeout(KUBO_TIMEOUT)

    local ok, err = httpc:connect("kubo", 5001)
    if not ok then
        validator.send_error(502, "IPFS node unavailable: " .. (err or "unknown error"))
        return false, nil
    end

    -- Build query string from request args
    local args = ngx.req.get_uri_args()
    local query_params = {}
    for key, val in pairs(args) do
        if type(val) == "table" then
            for _, v in ipairs(val) do
                table.insert(query_params, key .. "=" .. ngx.escape_uri(v))
            end
        else
            table.insert(query_params, key .. "=" .. ngx.escape_uri(val))
        end
    end
    local query_string = ""
    if #query_params > 0 then
        query_string = "?" .. table.concat(query_params, "&")
    end

    -- Forward request to Kubo with original multipart body
    local res, err = httpc:request({
        method = "POST",
        path = "/api/v0/dag/put" .. query_string,
        headers = {
            ["Content-Type"] = ngx.var.content_type,  -- Forward original content-type with boundary
            ["User-Agent"] = "nginx-security-facade/1.0"
        },
        body = multipart_body
    })

    if not res then
        httpc:close()
        validator.send_error(502, "DAG put request failed: " .. (err or "unknown error"))
        return false, nil
    end

    local response_body = res:read_body()
    httpc:close()

    -- Relay Kubo response
    ngx.status = res.status
    if res.status == 200 then
        ngx.say(response_body)

        -- Extract CID from response for logging
        local response_json = cjson.decode(response_body)
        local cid = response_json and response_json.Cid and response_json.Cid["/"]
        return true, cid
    else
        ngx.say(response_body or '{"Message":"DAG put failed"}')
        return false, nil
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

    -- Check daily quota
    if not check_dag_quota(client_ip) then
        return
    end

    -- Extract and validate multipart file content
    local json_obj, multipart_body = extract_multipart_file()
    if not json_obj then
        return
    end

    -- Validate against schema
    if not validate_schema(json_obj) then
        return
    end

    -- All validations passed, delegate to Kubo
    local success, cid = delegate_to_kubo(multipart_body)
    if success then
        -- Increment quota only on successful put
        increment_dag_quota(client_ip)

        -- Log successful DAG put for monitoring
        ngx.log(ngx.INFO, "Successful DAG put: cid=" .. (cid or "unknown") .. " ip=" .. client_ip .. " size=" .. #multipart_body)
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
