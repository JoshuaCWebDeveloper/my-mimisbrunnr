-- Health detailed endpoint - Check all service status
-- Provides comprehensive health information for monitoring

local cjson = require "cjson"
local http = require "resty.http"

-- Check health status of all services
local function check_all_services()
    local httpc = http.new()
    
    -- Check validator health
    local validator_ok = false
    local validator_error = nil
    local res, err = httpc:request_uri("http://validator:3000/health", {
        method = "GET",
        timeout = 2000
    })
    if res and res.status == 200 then
        validator_ok = true
    else
        validator_error = err or ("HTTP " .. (res and res.status or "timeout"))
    end
    
    -- Check Kubo health
    local kubo_ok = false
    local kubo_error = nil
    res, err = httpc:request_uri("http://kubo:5001/api/v0/version", {
        method = "GET",
        timeout = 2000
    })
    if res and res.status == 200 then
        kubo_ok = true
    else
        kubo_error = err or ("HTTP " .. (res and res.status or "timeout"))
    end
    
    -- Overall system status
    local overall_status = "healthy"
    if not validator_ok or not kubo_ok then
        overall_status = "degraded"
    end
    if not validator_ok and not kubo_ok then
        overall_status = "unhealthy"
    end
    
    local health = {
        status = overall_status,
        timestamp = os.time(),
        uptime = os.time() - ngx.shared.rate_store:get("start_time") or 0,
        services = {
            validator = {
                status = validator_ok and "up" or "down",
                error = validator_error
            },
            kubo = {
                status = kubo_ok and "up" or "down", 
                error = kubo_error
            },
            proxy = {
                status = "up", -- If we're responding, proxy is up
                worker_processes = ngx.worker.count(),
                connections = ngx.var.connections_active or "unknown"
            }
        },
        checks = {
            validator_health = validator_ok,
            kubo_version = kubo_ok,
            nginx_status = true
        }
    }
    
    return health
end

-- Main health check logic
local function main()
    -- Set response headers
    ngx.header.content_type = "application/json"
    ngx.header.cache_control = "no-cache"
    
    -- Get health status
    local health = check_all_services()
    
    -- Set appropriate HTTP status code
    if health.status == "healthy" then
        ngx.status = 200
    elseif health.status == "degraded" then
        ngx.status = 200 -- Still operational
    else
        ngx.status = 503 -- Service unavailable
    end
    
    -- Return JSON response
    ngx.say(cjson.encode(health))
    
    -- Log health check
    local status_msg = "Health check: " .. health.status
    if health.status ~= "healthy" then
        ngx.log(ngx.WARN, status_msg .. " - " .. cjson.encode(health.services))
    else
        ngx.log(ngx.INFO, status_msg)
    end
end

-- Execute main logic with error handling
local ok, err = pcall(main)
if not ok then
    ngx.log(ngx.ERR, "Health detailed error: " .. tostring(err))
    ngx.status = 500
    ngx.header.content_type = "application/json"
    ngx.say('{"status":"error","message":"Health check failed"}')
end