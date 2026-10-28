-- Net: the only bridge between clients and the server.
--   client -> server : Net.request(action, payload) -> result table   (RemoteFunction "Request")
--   server -> client : Net.push(player, channel, data) / Net.pushAll   (RemoteEvent "Push")
-- The server validates every payload; handlers never trust the client.

local ReplicatedStorage = game:GetService("ReplicatedStorage")
local RunService = game:GetService("RunService")

local Net = {}

local IS_SERVER = RunService:IsServer()
local FOLDER_NAME = "Remotes"

local folder: Folder? = nil
local requestFn: RemoteFunction? = nil
local pushEvent: RemoteEvent? = nil

local handlers: { [string]: (Player, any) -> any } = {}
local listeners: { [string]: { (any) -> () } } = {}
local pending: { [string]: { any } } = {}

-- Token bucket per player: bursts of 40, refills 20 requests per second.
local BUCKET_SIZE = 40
local REFILL_PER_SECOND = 20
local buckets: { [Player]: { tokens: number, last: number } } = {}

local function allow(player: Player): boolean
	local now = os.clock()
	local b = buckets[player]
	if not b then
		b = { tokens = BUCKET_SIZE, last = now }
		buckets[player] = b
	end
	b.tokens = math.min(BUCKET_SIZE, b.tokens + (now - b.last) * REFILL_PER_SECOND)
	b.last = now
	if b.tokens < 1 then
		return false
	end
	b.tokens -= 1
	return true
end

local function deliver(channel: string, data: any)
	local list = listeners[channel]
	if list and #list > 0 then
		for _, fn in list do
			task.spawn(fn, data)
		end
	else
		-- keep early messages until a listener registers (e.g. the first data snapshot)
		local q = pending[channel]
		if not q then
			q = {}
			pending[channel] = q
		end
		table.insert(q, data)
		if #q > 50 then
			table.remove(q, 1)
		end
	end
end

local function ensure()
	if folder then
		return
	end
	if IS_SERVER then
		local f = ReplicatedStorage:FindFirstChild(FOLDER_NAME) :: Folder?
		if not f then
			f = Instance.new("Folder")
			f.Name = FOLDER_NAME
			f.Parent = ReplicatedStorage
		end
		local rf = Instance.new("RemoteFunction")
		rf.Name = "Request"
		rf.Parent = f
		local re = Instance.new("RemoteEvent")
		re.Name = "Push"
		re.Parent = f
		folder, requestFn, pushEvent = f, rf, re

		rf.OnServerInvoke = function(player: Player, action: any, payload: any)
			if typeof(action) ~= "string" or #action > 48 then
				return { ok = false, err = "bad_action" }
			end
			if not allow(player) then
				return { ok = false, err = "rate_limited" }
			end
			local handler = handlers[action]
			if not handler then
				return { ok = false, err = "unknown_action" }
			end
			local ok, result = pcall(handler, player, payload)
			if not ok then
				warn(string.format("[Net] %s failed for %s: %s", action, player.Name, tostring(result)))
				return { ok = false, err = "internal" }
			end
			if result == nil then
				return { ok = true }
			end
			return result
		end
	else
		local f = ReplicatedStorage:WaitForChild(FOLDER_NAME) :: Folder
		folder = f
		requestFn = f:WaitForChild("Request") :: RemoteFunction
		pushEvent = f:WaitForChild("Push") :: RemoteEvent;
		(pushEvent :: RemoteEvent).OnClientEvent:Connect(function(channel: string, data: any)
			deliver(channel, data)
		end)
	end
end

----------------------------------------------------------------------------------------------------
-- Server
----------------------------------------------------------------------------------------------------

function Net.init()
	ensure()
end

function Net.handle(action: string, fn: (Player, any) -> any)
	assert(IS_SERVER, "Net.handle is server-only")
	handlers[action] = fn
end

function Net.push(player: Player, channel: string, data: any)
	ensure();
	(pushEvent :: RemoteEvent):FireClient(player, channel, data)
end

function Net.pushAll(channel: string, data: any)
	ensure();
	(pushEvent :: RemoteEvent):FireAllClients(channel, data)
end

function Net.forget(player: Player)
	buckets[player] = nil
end

----------------------------------------------------------------------------------------------------
-- Client
----------------------------------------------------------------------------------------------------

-- Returns the server's result table ({ ok = bool, err = string?, ... }).
function Net.request(action: string, payload: any?): { [string]: any }
	ensure()
	local ok, result = pcall(function()
		return (requestFn :: RemoteFunction):InvokeServer(action, payload)
	end)
	if not ok then
		return { ok = false, err = "network" }
	end
	if typeof(result) ~= "table" then
		return { ok = false, err = "network" }
	end
	return result
end

function Net.on(channel: string, fn: (any) -> ())
	ensure()
	local list = listeners[channel]
	if not list then
		list = {}
		listeners[channel] = list
	end
	table.insert(list, fn)
	local q = pending[channel]
	if q then
		pending[channel] = nil
		for _, data in q do
			task.spawn(fn, data)
		end
	end
end

-- Test hook: inject a push as if it came from the server.
function Net._deliver(channel: string, data: any)
	deliver(channel, data)
end

----------------------------------------------------------------------------------------------------
-- Payload validation helpers (server side)
----------------------------------------------------------------------------------------------------

local V = {}
Net.V = V

function V.str(v: any, maxLen: number?): boolean
	return typeof(v) == "string" and #v <= (maxLen or 200)
end

function V.id(v: any): boolean
	return typeof(v) == "string" and #v > 0 and #v <= 64 and string.match(v, "^[%w_%-%.]+$") ~= nil
end

function V.num(v: any, lo: number?, hi: number?): boolean
	if typeof(v) ~= "number" or v ~= v or v == math.huge or v == -math.huge then
		return false
	end
	if lo and v < lo then
		return false
	end
	if hi and v > hi then
		return false
	end
	return true
end

function V.int(v: any, lo: number?, hi: number?): boolean
	return V.num(v, lo, hi) and math.floor(v) == v
end

function V.bool(v: any): boolean
	return typeof(v) == "boolean"
end

function V.tbl(v: any): boolean
	return typeof(v) == "table"
end

return Net
