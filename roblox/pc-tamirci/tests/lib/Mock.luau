-- Mock: pure-Luau stand-ins for Roblox datatypes Lune doesn't provide
-- (Random, TweenInfo, RaycastParams, OverlapParams, DateTime) and a signal object.

local Mock = {}

----------------------------------------------------------------------------------------------------
-- Signal
----------------------------------------------------------------------------------------------------
local Signal = {}
Signal.__index = Signal

function Signal.new(name: string?)
	return setmetatable({ _h = {}, _name = name }, Signal)
end

function Signal:Connect(fn)
	local c = { Connected = true, _fn = fn }
	local list = self._h
	function c.Disconnect(conn)
		conn.Connected = false
		local i = table.find(list, conn)
		if i then
			table.remove(list, i)
		end
	end
	table.insert(list, c)
	return c
end

function Signal:Once(fn)
	local c
	c = self:Connect(function(...)
		c:Disconnect()
		fn(...)
	end)
	return c
end

function Signal:ConnectParallel(fn)
	return self:Connect(fn)
end

function Signal:Fire(...)
	for _, c in table.clone(self._h) do
		if c.Connected then
			local ok, err = pcall(c._fn, ...)
			if not ok then
				Mock.errors = Mock.errors or {}
				table.insert(Mock.errors, tostring(err))
				print("[signal handler error] " .. tostring(self._name) .. ": " .. tostring(err))
			end
		end
	end
end

function Signal:Wait()
	-- tests never block on engine signals; return immediately
	return nil
end

function Signal:count()
	return #self._h
end

Mock.Signal = Signal

----------------------------------------------------------------------------------------------------
-- Random (xorshift32, deterministic)
----------------------------------------------------------------------------------------------------
local RandomMT = {}
RandomMT.__index = RandomMT
RandomMT.__type = "Random"

local function nextU32(self)
	local x = self._s
	x = bit32.bxor(x, bit32.lshift(x, 13))
	x = bit32.bxor(x, bit32.rshift(x, 17))
	x = bit32.bxor(x, bit32.lshift(x, 5))
	self._s = x
	return x
end

local seedCounter = 0
local RandomLib = {}
function RandomLib.new(seed: number?)
	if seed == nil then
		seedCounter += 1
		seed = os.clock() * 1e6 + seedCounter * 7919
	end
	local s = math.floor(math.abs(seed :: number)) % 4294967296
	s = bit32.bxor(s, 0x9E3779B9)
	if s == 0 then
		s = 0x12345678
	end
	local r = setmetatable({ _s = s }, RandomMT)
	for _ = 1, 4 do
		nextU32(r)
	end
	return r
end

function RandomMT:NextNumber(a: number?, b: number?)
	local f = nextU32(self) / 4294967296
	if a and b then
		return a + (b - a) * f
	end
	return f
end

function RandomMT:NextInteger(a: number, b: number)
	assert(type(a) == "number" and type(b) == "number", "NextInteger expects two numbers")
	if b < a then
		error("invalid argument #2 to 'NextInteger' (interval is empty)")
	end
	local span = b - a + 1
	return a + (nextU32(self) % span)
end

function RandomMT:NextUnitVector()
	local roblox = require("@lune/roblox")
	local z = self:NextNumber(-1, 1)
	local t = self:NextNumber(0, math.pi * 2)
	local r = math.sqrt(1 - z * z)
	return roblox.Vector3.new(r * math.cos(t), r * math.sin(t), z)
end

function RandomMT:Shuffle(tb)
	for i = #tb, 2, -1 do
		local j = self:NextInteger(1, i)
		tb[i], tb[j] = tb[j], tb[i]
	end
end

function RandomMT:Clone()
	return setmetatable({ _s = self._s }, RandomMT)
end

Mock.Random = RandomLib

----------------------------------------------------------------------------------------------------
-- TweenInfo
----------------------------------------------------------------------------------------------------
local TweenInfoLib = {}
function TweenInfoLib.new(time, style, direction, repeatCount, reverses, delayTime)
	return setmetatable({
		Time = time or 1,
		EasingStyle = style,
		EasingDirection = direction,
		RepeatCount = repeatCount or 0,
		Reverses = reverses or false,
		DelayTime = delayTime or 0,
	}, { __type = "TweenInfo" })
end
Mock.TweenInfo = TweenInfoLib

----------------------------------------------------------------------------------------------------
-- RaycastParams / OverlapParams
----------------------------------------------------------------------------------------------------
local function paramsLib(typeName)
	local lib = {}
	function lib.new()
		return setmetatable({
			FilterDescendantsInstances = {},
			FilterType = nil,
			IgnoreWater = false,
			CollisionGroup = "Default",
			RespectCanCollide = false,
			MaxParts = 0,
			BruteForceAllSlow = false,
			AddToFilter = function(self, x)
				table.insert(self.FilterDescendantsInstances, x)
			end,
		}, { __type = typeName })
	end
	return lib
end
Mock.RaycastParams = paramsLib("RaycastParams")
Mock.OverlapParams = paramsLib("OverlapParams")

----------------------------------------------------------------------------------------------------
-- DateTime
----------------------------------------------------------------------------------------------------
local DateTimeLib = {}
function DateTimeLib.now()
	local t = os.time()
	return setmetatable({
		UnixTimestamp = t,
		UnixTimestampMillis = t * 1000,
		FormatLocalTime = function(_, fmt)
			return os.date("%Y-%m-%d %H:%M", t)
		end,
		ToLocalTime = function()
			return os.date("*t", t)
		end,
	}, { __type = "DateTime" })
end
function DateTimeLib.fromUnixTimestamp(t)
	local d = DateTimeLib.now()
	d.UnixTimestamp = t
	d.UnixTimestampMillis = t * 1000
	return d
end
Mock.DateTime = DateTimeLib

return Mock
